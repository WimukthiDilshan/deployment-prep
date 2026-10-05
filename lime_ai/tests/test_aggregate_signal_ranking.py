import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config.database import Base
from models.student_lesson_top_signals import StudentLessonTopSignals
from models.prediction import CognitiveLoadPrediction
from schemas.prediction import (
    AggregateExplanationRequest,
    TechniqueFeedbackRequest,
    TeacherGuidanceDecision,
)
from services.student_guidance_service import GUIDANCE_VERSION
from services.prediction_service import (
    _save_top_aggregate_signals,
    _top_aggregate_signals,
    get_cached_student_lesson_analysis,
    get_student_lesson_cognitive_load_counts,
    list_shared_student_lesson_guidance,
    regenerate_student_lesson_guidance,
    reject_student_lesson_guidance,
    save_student_technique_feedback,
    share_student_lesson_guidance,
)


class AggregateSignalRankingTests(unittest.TestCase):
    def test_normalizes_aggregates_and_ranks_unique_positive_features(self):
        signals = _top_aggregate_signals(
            lime_factors=[
                {"rule": "pause_frequency > 5", "weight": 0.5},
                {"rule": "time_on_content <= 10", "weight": -0.4},
                {"rule": "rewatch_segments > 2", "weight": 0.25},
            ],
            shap_values=[
                {"feature": "pause_frequency", "shap_value": 0.8},
                {"feature": "time_on_content", "shap_value": -0.9},
                {"feature": "playback_rate_change", "shap_value": 0.4},
            ],
            limit=3,
        )

        self.assertEqual(
            [item["signal"] for item in signals],
            ["pause_frequency", "playback_rate_change", "rewatch_segments"],
        )
        self.assertEqual(signals[0]["source"], "combined")
        self.assertAlmostEqual(signals[0]["raw_value"], 2 / 3)
        self.assertAlmostEqual(signals[0]["normalized_strength"], 1.0)
        self.assertAlmostEqual(signals[1]["normalized_strength"], 0.25)
        self.assertAlmostEqual(signals[2]["normalized_strength"], 0.25)
        self.assertTrue(all(item["raw_value"] > 0 for item in signals))
        self.assertTrue(all(item["impact"] == "positive" for item in signals))

    def test_normalizes_by_each_positive_sum_then_averages_lime_and_shap(self):
        signals = _top_aggregate_signals(
            lime_factors=[
                {"rule": "idle_duration_video", "weight": 0.40},
                {"rule": "playback_rate_change", "weight": 0.20},
                {"rule": "navigation_count_video", "weight": -0.10},
                {"rule": "rewatch_segments", "weight": 0.10},
                {"rule": "pause_frequency", "weight": 0.05},
            ],
            shap_values=[
                {"feature": "idle_duration_video", "shap_value": 0.15},
                {"feature": "playback_rate_change", "shap_value": -0.05},
                {"feature": "navigation_count_video", "shap_value": 0.30},
                {"feature": "rewatch_segments", "shap_value": 0.15},
                {"feature": "pause_frequency", "shap_value": 0.06},
            ],
            limit=3,
        )

        self.assertEqual(
            [item["signal"] for item in signals],
            ["idle_duration_video", "navigation_count_video", "rewatch_segments"],
        )
        self.assertAlmostEqual(signals[0]["raw_value"], ((0.40 / 0.75) + (0.15 / 0.66)) / 2)
        self.assertAlmostEqual(signals[1]["raw_value"], ((0.0 / 0.75) + (0.30 / 0.66)) / 2)
        self.assertAlmostEqual(signals[2]["raw_value"], ((0.10 / 0.75) + (0.15 / 0.66)) / 2)

    def test_removes_zero_and_negative_values(self):
        signals = _top_aggregate_signals(
            lime_factors=[{"rule": "pause_frequency <= 1", "weight": 0.0}],
            shap_values=[
                {"feature": "pause_frequency", "shap_value": 0.5},
                {"feature": "time_on_content", "shap_value": -0.8},
            ],
            limit=3,
        )

        self.assertEqual(len(signals), 1)
        self.assertEqual(signals[0]["signal"], "pause_frequency")
        self.assertEqual(signals[0]["normalized_value"], 1.0)

    def test_returns_no_top_signals_when_all_values_are_non_positive(self):
        signals = _top_aggregate_signals(
            lime_factors=[{"rule": "pause_frequency > 5", "weight": -0.2}],
            shap_values=[{"feature": "time_on_content", "shap_value": 0.0}],
        )

        self.assertEqual(signals, [])

    def test_tied_features_are_deterministic_when_input_order_changes(self):
        lime_factors = [
            {"rule": "rewatch_segments > 2", "weight": 0.5},
            {"rule": "pause_frequency > 5", "weight": 0.5},
        ]
        shap_values = [
            {"feature": "time_on_content", "shap_value": 0.4},
            {"feature": "playback_rate_change", "shap_value": 0.4},
        ]

        first = _top_aggregate_signals(lime_factors=lime_factors, shap_values=shap_values)
        second = _top_aggregate_signals(
            lime_factors=list(reversed(lime_factors)),
            shap_values=list(reversed(shap_values)),
        )

        self.assertEqual(first, second)


class AggregateSignalPersistenceTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.payload = AggregateExplanationRequest(
            lesson_id="lesson-7",
            prediction_id=42,
            student_id="student-9",
            predicted_cognitive_load="High",
            predicted_score=4,
            confidence=0.91,
            lime_factors=[],
            shap_values=[],
        )

    def tearDown(self):
        self.db.close()

    def test_saves_top_three_and_updates_same_student_lesson(self):
        initial = [
            {"signal": "pause_frequency", "raw_value": 2.0, "normalized_value": 1.0},
            {"signal": "rewatch_segments", "raw_value": 1.2, "normalized_value": 0.6},
            {"signal": "time_on_content", "raw_value": 0.8, "normalized_value": 0.4},
        ]
        first = _save_top_aggregate_signals(self.db, self.payload, initial)

        self.assertEqual(first.student_id, "student-9")
        self.assertEqual(first.lesson_id, "lesson-7")
        self.assertEqual(first.predicted_cognitive_load, "High")
        self.assertEqual(first.top_1_signal, "pause_frequency")
        self.assertEqual(first.top_3_value, 0.8)

        self.payload.prediction_id = 43
        self.payload.predicted_cognitive_load = "Very High"
        updated = _save_top_aggregate_signals(
            self.db,
            self.payload,
            [{"signal": "idle_duration_video", "raw_value": 1.0, "normalized_value": 1.0}],
        )

        self.assertEqual(updated.id, first.id)
        self.assertEqual(updated.prediction_id, 43)
        self.assertEqual(updated.predicted_cognitive_load, "Very High")
        self.assertEqual(updated.top_1_signal, "idle_duration_video")
        self.assertIsNone(updated.top_2_signal)
        self.assertIsNone(updated.top_3_value)
        self.assertEqual(self.db.query(StudentLessonTopSignals).count(), 1)

    def test_complete_analysis_can_be_loaded_without_regeneration(self):
        self.payload.lime_explanation = {
            "prediction_id": 42,
            "intercept": 2.5,
            "factors": [{"rule": "pause_frequency > 5", "weight": 0.4}],
        }
        self.payload.shap_explanation = {
            "prediction_id": 42,
            "expected_value": 2.1,
            "shap_values": [{"feature": "pause_frequency", "shap_value": 0.7}],
        }
        _save_top_aggregate_signals(
            self.db,
            self.payload,
            [{"signal": "pause_frequency", "raw_value": 2.0, "normalized_value": 1.0}],
            human_explanation="The student paused frequently while working through the lesson.",
            explanation_source="gemini",
            study_technique={
                "techniques": [{"technique": "Pomodoro"}],
                "source": "gemini",
                "guidance_version": GUIDANCE_VERSION,
            },
            lecture_support={
                "strategies": "1. Pause after each concept.",
                "source": "gemini",
                "guidance_version": GUIDANCE_VERSION,
            },
        )

        result = get_cached_student_lesson_analysis(self.db, "lesson-7", "student-9")

        self.assertTrue(result["data"]["cached"])
        self.assertEqual(result["data"]["lime_explanation"]["intercept"], 2.5)
        self.assertEqual(result["data"]["shap_explanation"]["expected_value"], 2.1)
        self.assertEqual(
            result["data"]["aggregate_explanation"]["study_technique"]["source"],
            "gemini",
        )
        self.assertEqual(
            result["data"]["aggregate_explanation"]["top_signals"][0]["signal"],
            "pause_frequency",
        )
        self.assertFalse(result["data"]["guidance_refreshed"])

    @patch("services.prediction_service.generate_student_guidance")
    def test_refreshes_old_guidance_without_rerunning_saved_lime_or_shap(self, generate):
        self.payload.lime_explanation = {"factors": [{"rule": "pause_frequency", "weight": 0.4}]}
        self.payload.shap_explanation = {
            "shap_values": [{"feature": "pause_frequency", "shap_value": 0.5}]
        }
        _save_top_aggregate_signals(
            self.db,
            self.payload,
            [{"signal": "pause_frequency", "raw_value": 1.0, "normalized_value": 1.0}],
            human_explanation="Old technical explanation",
            explanation_source="gemini",
            study_technique={"techniques": [{"technique": "short notes"}]},
            lecture_support={"strategies": "1) Old recommendation."},
        )
        generate.return_value = {
            "human_explanation": "This student has High cognitive load because frequent pauses suggest the lesson required extra effort.",
            "study_technique": {
                "techniques": [{"technique": "short notes"}],
                "source": "gemini",
                "guidance_version": GUIDANCE_VERSION,
            },
            "lecture_support": {
                "strategies": "1) Review one idea at a time.",
                "source": "gemini",
                "guidance_version": GUIDANCE_VERSION,
            },
        }

        result = get_cached_student_lesson_analysis(self.db, "lesson-7", "student-9")

        generate.assert_called_once()
        self.assertTrue(result["data"]["cached"])
        self.assertTrue(result["data"]["guidance_refreshed"])
        self.assertEqual(
            result["data"]["aggregate_explanation"]["human_explanation"],
            generate.return_value["human_explanation"],
        )

    def test_top_signals_only_is_not_treated_as_complete_cache(self):
        _save_top_aggregate_signals(
            self.db,
            self.payload,
            [{"signal": "pause_frequency", "raw_value": 2.0, "normalized_value": 1.0}],
        )

        result = get_cached_student_lesson_analysis(self.db, "lesson-7", "student-9")

        self.assertIsNone(result["data"])

    def test_teacher_can_share_saved_guidance_and_student_can_list_it(self):
        self.payload.lime_explanation = {"factors": []}
        self.payload.shap_explanation = {"shap_values": []}
        _save_top_aggregate_signals(
            self.db,
            self.payload,
            [{"signal": "pause_frequency", "raw_value": 1.0, "normalized_value": 1.0}],
            human_explanation="Saved explanation",
            explanation_source="gemini",
            study_technique={
                "techniques": [{"technique": "short notes"}],
                "teacher_review": {"status": "pending", "regeneration_count": 0},
                "student_feedback": {},
            },
            lecture_support={"strategies": "1) Pause after each concept."},
        )

        shared = share_student_lesson_guidance(self.db, "lesson-7", "student-9")
        listed = list_shared_student_lesson_guidance(self.db, "student-9")

        self.assertTrue(shared["data"]["shared_to_student"])
        self.assertEqual(shared["data"]["teacher_review"]["status"], "approved")
        self.assertEqual(len(listed["data"]), 1)
        self.assertEqual(listed["data"][0]["lesson_id"], "lesson-7")
        self.assertEqual(
            listed["data"][0]["study_technique"]["techniques"][0]["technique"],
            "short notes",
        )

    def test_student_feedback_is_saved_only_for_a_shared_recommendation(self):
        self.payload.lime_explanation = {"factors": []}
        self.payload.shap_explanation = {"shap_values": []}
        _save_top_aggregate_signals(
            self.db,
            self.payload,
            [{"signal": "pause_frequency", "raw_value": 1.0, "normalized_value": 1.0}],
            human_explanation="Saved explanation",
            study_technique={
                "techniques": [{"technique": "short notes"}],
                "teacher_review": {"status": "pending", "regeneration_count": 0},
                "student_feedback": {},
            },
            lecture_support={"strategies": "1) Pause after each concept."},
        )
        feedback = TechniqueFeedbackRequest(
            technique="short notes",
            used=True,
            helpfulness=4,
            ease_of_use=5,
            comment="Easy to review.",
        )

        with self.assertRaises(HTTPException) as error:
            save_student_technique_feedback(self.db, "lesson-7", "student-9", feedback)
        self.assertEqual(error.exception.status_code, 404)

        share_student_lesson_guidance(self.db, "lesson-7", "student-9")
        saved = save_student_technique_feedback(self.db, "lesson-7", "student-9", feedback)

        self.assertEqual(saved["data"]["helpfulness"], 4)
        listed = list_shared_student_lesson_guidance(self.db, "student-9")
        self.assertEqual(
            listed["data"][0]["study_technique"]["student_feedback"]["short notes"]["ease_of_use"],
            5,
        )

    def test_teacher_can_reject_and_withhold_guidance(self):
        self.payload.lime_explanation = {"factors": []}
        self.payload.shap_explanation = {"shap_values": []}
        _save_top_aggregate_signals(
            self.db,
            self.payload,
            [{"signal": "pause_frequency", "raw_value": 1.0, "normalized_value": 1.0}],
            human_explanation="Saved explanation",
            study_technique={
                "techniques": [{"technique": "short notes"}],
                "teacher_review": {"status": "pending", "regeneration_count": 0},
            },
            lecture_support={"strategies": "1) Pause after each concept."},
        )
        share_student_lesson_guidance(self.db, "lesson-7", "student-9")

        rejected = reject_student_lesson_guidance(
            self.db,
            "lesson-7",
            "student-9",
            TeacherGuidanceDecision(reason="Not suitable for this lesson."),
        )

        self.assertFalse(rejected["data"]["shared_to_student"])
        self.assertEqual(rejected["data"]["teacher_review"]["status"], "rejected")
        self.assertEqual(list_shared_student_lesson_guidance(self.db, "student-9")["data"], [])

    @patch("services.prediction_service.generate_student_guidance")
    def test_regeneration_resets_review_and_archives_existing_feedback(self, generate):
        self.payload.lime_explanation = {"factors": []}
        self.payload.shap_explanation = {"shap_values": []}
        _save_top_aggregate_signals(
            self.db,
            self.payload,
            [{"signal": "pause_frequency", "raw_value": 1.0, "normalized_value": 1.0}],
            human_explanation="Old explanation",
            study_technique={
                "techniques": [{"technique": "short notes"}],
                "teacher_review": {"status": "approved", "regeneration_count": 1},
                "student_feedback": {"short notes": {"used": True, "helpfulness": 4}},
            },
            lecture_support={"strategies": "1) Old strategy."},
        )
        share_student_lesson_guidance(self.db, "lesson-7", "student-9")
        generate.return_value = {
            "human_explanation": "New explanation",
            "study_technique": {
                "techniques": [{"technique": "flowchart"}],
                "source": "constrained gemini",
                "guidance_version": GUIDANCE_VERSION,
                "teacher_review": {"status": "pending", "regeneration_count": 0},
                "student_feedback": {},
            },
            "lecture_support": {"strategies": "1) New strategy."},
        }

        result = regenerate_student_lesson_guidance(self.db, "lesson-7", "student-9")

        self.assertFalse(result["data"]["shared_to_student"])
        self.assertEqual(result["data"]["study_technique"]["teacher_review"]["status"], "pending")
        self.assertEqual(
            result["data"]["study_technique"]["teacher_review"]["regeneration_count"],
            2,
        )
        self.assertEqual(len(result["data"]["study_technique"]["feedback_history"]), 1)


class CognitiveLoadCountTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def _prediction(self, label: str, minute: int) -> CognitiveLoadPrediction:
        return CognitiveLoadPrediction(
            student_id="student-1",
            lesson_id="lesson-1",
            session_id="session-1",
            minute_index=minute,
            pause_frequency=1,
            navigation_count_video=1,
            rewatch_segments=1,
            playback_rate_change=1,
            idle_duration_video=1,
            time_on_content=1,
            navigation_count_adaptation=0,
            revisit_frequency=0,
            idle_duration_adaptation=0,
            quiz_response_time=0,
            error_rate=0.0,
            predicted_cognitive_load=label,
            predicted_score=3,
            confidence=0.8,
        )

    def test_returns_highest_count_for_selected_student_and_lesson(self):
        self.db.add_all([
            self._prediction("Low", 1),
            self._prediction("High", 2),
            self._prediction("High", 3),
        ])
        self.db.commit()

        result = get_student_lesson_cognitive_load_counts(
            self.db, "lesson-1", "student-1"
        )["data"]

        self.assertEqual(result["counts"], {"High": 2, "Low": 1})
        self.assertEqual(result["dominant_cognitive_load"], "High")
        self.assertEqual(result["total_predictions"], 3)


if __name__ == "__main__":
    unittest.main()
