import json
import unittest
from unittest.mock import patch

from services.gemini_client import GeminiServiceError
from services.student_guidance_service import (
    GUIDANCE_VERSION,
    _parse_techniques,
    generate_student_guidance,
)
from services.study_technique_service import enrich_study_technique_payload


class StudentGuidanceServiceTests(unittest.TestCase):
    def test_rejects_invented_matched_behaviour(self):
        with self.assertRaisesRegex(GeminiServiceError, "invented"):
            _parse_techniques(
                [
                    {
                        "name": "Short Notes",
                        "reason": "This recommendation provides a sufficiently complete test reason.",
                        "matched_signals": ["an invented behaviour"],
                    }
                ],
                signals=["frequent pauses"],
            )

    @patch("services.student_guidance_service.generate_gemini_text")
    def test_generates_all_guidance_with_one_gemini_call(self, generate_text):
        generate_text.return_value = json.dumps(
            {
                "teacher_explanation": (
                    "This student has High cognitive load because frequent pauses and repeated viewing "
                    "suggest that several ideas required extra processing. Longer inactive periods also "
                    "indicate that maintaining attention was difficult, so understanding the lesson likely "
                    "required more mental effort than usual."
                ),
                "study_techniques": [
                    {
                        "name": "Short Notes",
                        "reason": "Frequent pauses suggest that reducing the lesson to smaller key points may help.",
                        "matched_signals": ["frequent pauses"],
                    },
                    {
                        "name": "Flowchart",
                        "reason": "Frequent pauses suggest that an ordered sequence may make the lesson easier to follow.",
                        "matched_signals": ["frequent pauses"],
                    },
                ],
                "lecture_recommendations": [
                    "Pause briefly after each key idea so you can process it.",
                    "Write down unfamiliar terms to review after the lecture.",
                    "Break difficult sections into smaller steps before continuing.",
                    "Check your understanding by summarizing each section in your own words.",
                ],
            }
        )

        result = generate_student_guidance(
            student_id="student-9",
            lesson_id="lesson-7",
            predicted_label="High",
            signals=["frequent pauses"],
            human_signals=["behavior associated with increased cognitive load: frequent pauses"],
        )

        generate_text.assert_called_once()
        self.assertEqual(
            generate_text.call_args.kwargs["response_mime_type"],
            "application/json",
        )
        self.assertEqual(result["study_technique"]["source"], "constrained gemini")
        self.assertEqual(result["study_technique"]["guidance_version"], GUIDANCE_VERSION)
        self.assertEqual(len(result["study_technique"]["techniques"]), 2)
        first_technique = result["study_technique"]["techniques"][0]
        self.assertEqual(first_technique["tool_name"], "Notion")
        self.assertTrue(first_technique["description"])
        self.assertEqual(len(first_technique["steps"]), 5)
        self.assertIn("third-party website", first_technique["account_note"])
        self.assertIn("No account needed", first_technique["paper_alternative"])
        self.assertEqual(first_technique["matched_signals"], ["frequent pauses"])
        self.assertNotIn("suitability_score", first_technique)
        self.assertEqual(first_technique["selection_method"], "constrained gemini")
        evidence = result["study_technique"]["selection_evidence"]
        self.assertEqual(evidence["temperature"], 0.1)
        self.assertEqual(len(evidence["allowed_techniques"]), 5)
        self.assertEqual(result["study_technique"]["teacher_review"]["status"], "pending")
        self.assertEqual(result["study_technique"]["student_feedback"], {})
        self.assertEqual(result["lecture_support"]["strategies"].count("\n"), 3)
        self.assertTrue(result["human_explanation"].startswith("This student has High"))
        self.assertIn("explain only why", generate_text.call_args.args[0])
        self.assertIn("must contain no advice", generate_text.call_args.args[1])
        self.assertEqual(generate_text.call_args.kwargs["temperature"], 0.1)
        self.assertEqual(generate_text.call_args.kwargs["max_output_tokens"], 1024)
        self.assertIn("allowed study-technique catalogue", generate_text.call_args.args[1].lower())

    @patch("services.student_guidance_service.generate_gemini_text")
    def test_rejects_malformed_json(self, generate_text):
        generate_text.return_value = "not json"

        with self.assertRaisesRegex(GeminiServiceError, "malformed"):
            generate_student_guidance(
                student_id="student-9",
                lesson_id="lesson-7",
                predicted_label="High",
                signals=[],
                human_signals=[],
            )

    @patch("services.student_guidance_service.generate_gemini_text")
    def test_rejects_a_technique_outside_the_constrained_catalogue(self, generate_text):
        generate_text.return_value = json.dumps(
            {
                "teacher_explanation": (
                    "This student has High cognitive load because frequent pauses suggest that several "
                    "ideas needed additional processing. The repeated interruption to the learning flow "
                    "may indicate that following the material required more mental effort than usual. "
                    "Together, these observed actions support the reported high load level for this lesson."
                ),
                "study_techniques": [
                    {
                        "name": "Pomodoro",
                        "reason": "This was invented outside the controlled candidate shortlist.",
                        "matched_signals": ["an invented signal"],
                    }
                ],
                "lecture_recommendations": [
                    "Pause after each key idea so you can process it.",
                    "Write down unfamiliar terms so you can review them.",
                    "Break difficult sections into smaller steps before continuing.",
                    "Check your understanding by summarizing each section.",
                ],
            }
        )

        with self.assertRaisesRegex(GeminiServiceError, "allowed catalogue"):
            generate_student_guidance(
                student_id="student-9",
                lesson_id="lesson-7",
                predicted_label="High",
                signals=["frequent pauses"],
                human_signals=["behavior associated with increased cognitive load: frequent pauses"],
            )

    def test_enriches_cached_techniques_without_an_ai_call(self):
        cached_payload = {
            "source": "gemini",
            "techniques": [
                {
                    "technique": "flowchart",
                    "title": "Old title",
                    "link": "https://old.example/",
                }
            ],
        }

        result = enrich_study_technique_payload(cached_payload)

        self.assertEqual(result["source"], "gemini")
        self.assertEqual(result["techniques"][0]["title"], "Flowchart")
        self.assertEqual(result["techniques"][0]["tool_name"], "Lucidchart")
        self.assertEqual(len(result["techniques"][0]["steps"]), 5)
        self.assertEqual(cached_payload["techniques"][0]["title"], "Old title")


if __name__ == "__main__":
    unittest.main()
