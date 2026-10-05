from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
import numpy as np
from lime.lime_tabular import LimeTabularExplainer
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.prediction import CognitiveLoadPrediction
from models.student_lesson_summary import StudentLessonSummary
from models.student_lesson_top_signals import StudentLessonTopSignals
from schemas.prediction import (
    AggregateExplanationRequest,
    CognitiveLoadInput,
    TechniqueFeedbackRequest,
    TeacherGuidanceDecision,
)
from services.local_model import LocalModelError, predict_scores
from services.model_client import ModelClientError, request_prediction
from services.gemini_client import GeminiServiceError
from services.student_guidance_service import GUIDANCE_VERSION, generate_student_guidance
from services.study_technique_service import enrich_study_technique_payload


RAW_FEATURE_FIELDS = [
    "pause_frequency",
    "navigation_count_video",
    "rewatch_segments",
    "playback_rate_change",
    "idle_duration_video",
    "time_on_content",
]

# These columns remain in the shared table so existing installations and old
# prediction rows continue to work. They are no longer accepted as model inputs.
LEGACY_FEATURE_DEFAULTS = {
    "navigation_count_adaptation": 0,
    "revisit_frequency": 0,
    "idle_duration_adaptation": 0,
    "quiz_response_time": 0,
    "error_rate": 0.0,
}


def _signal_to_teacher_phrase(signal: str) -> str:
    normalized = signal.lower()

    phrase_map = {
        "pause_frequency": "the student paused the video frequently",
        "navigation_count_video": "the student jumped around the video often",
        "rewatch_segments": "the student rewatched video sections",
        "playback_rate_change": "the student changed playback speed a lot",
        "idle_duration_video": "the student stayed inactive during the video for long periods",
        "time_on_content": "the student spent a long time on the lesson content",
    }

    for feature_name, phrase in phrase_map.items():
        if feature_name in normalized:
            return phrase

    if any(token in normalized for token in ["pause", "idle", "wait"]):
        return "the student showed signs of delay or waiting"
    if any(token in normalized for token in ["error", "quiz"]):
        return "the quiz activity suggests the student needed more support"
    if any(token in normalized for token in ["rewatch", "revisit"]):
        return "the student went back over the material repeatedly"

    return "the signal points to higher cognitive load"



def _canonical_feature_name(signal: str) -> str:
    normalized_signal = signal.strip().lower()
    for feature_name in sorted(RAW_FEATURE_FIELDS, key=len, reverse=True):
        if feature_name.lower() in normalized_signal:
            return feature_name
    return normalized_signal


def _top_aggregate_signals(
    *,
    lime_factors: list[dict[str, Any]],
    shap_values: list[dict[str, Any]],
    limit: int = 3,
) -> list[dict[str, Any]]:
    # Negative and neutral contributions reduce or do not affect cognitive load,
    # so they must not appear among teacher-facing load-increasing factors.
    positive_lime_factors = [
        (factor, float(factor.get("weight", 0.0)))
        for factor in lime_factors
        if float(factor.get("weight", 0.0)) > 0
    ]
    positive_shap_values = [
        (item, float(item.get("shap_value", 0.0)))
        for item in shap_values
        if float(item.get("shap_value", 0.0)) > 0
    ]

    # Convert each explainer's positive contributions into shares of its own
    # positive total. This keeps LIME and SHAP on comparable 0-1 scales without
    # allowing the magnitude used by either explainer to dominate the ranking.
    total_lime_weight = sum(weight for _, weight in positive_lime_factors)
    total_shap_value = sum(shap_value for _, shap_value in positive_shap_values)
    combined_by_feature: dict[str, float] = {}

    for factor, weight in positive_lime_factors:
        feature_name = _canonical_feature_name(str(factor.get("rule", "unknown")))
        normalized_weight = weight / total_lime_weight if total_lime_weight else 0.0
        combined_by_feature[feature_name] = combined_by_feature.get(feature_name, 0.0) + (normalized_weight / 2.0)

    for item, shap_value in positive_shap_values:
        feature_name = _canonical_feature_name(str(item.get("feature", "unknown")))
        normalized_shap_value = shap_value / total_shap_value if total_shap_value else 0.0
        combined_by_feature[feature_name] = combined_by_feature.get(feature_name, 0.0) + (normalized_shap_value / 2.0)

    max_combined_importance = max(combined_by_feature.values(), default=0.0)

    # Rank by combined importance, using the canonical name as a deterministic
    # tie-breaker, and slice the strongest three load-increasing features.
    ranked_features = sorted(
        combined_by_feature.items(),
        key=lambda item: (-item[1], item[0]),
    )

    return [
        {
            "source": "combined",
            "signal": feature_name,
            "raw_value": combined_importance,
            "strength": combined_importance,
            "normalized_value": combined_importance / max_combined_importance if max_combined_importance else 0.0,
            "normalized_strength": combined_importance / max_combined_importance if max_combined_importance else 0.0,
            "impact": "positive",
        }
        for feature_name, combined_importance in ranked_features[: max(1, limit)]
    ]



def _save_top_aggregate_signals(
    db: Session,
    payload: AggregateExplanationRequest,
    top_signals: list[dict[str, Any]],
    *,
    human_explanation: str | None = None,
    explanation_source: str | None = None,
    study_technique: dict[str, Any] | None = None,
    lecture_support: dict[str, Any] | None = None,
) -> StudentLessonTopSignals:
    saved = (
        db.query(StudentLessonTopSignals)
        .filter(
            StudentLessonTopSignals.student_id == payload.student_id,
            StudentLessonTopSignals.lesson_id == payload.lesson_id,
        )
        .one_or_none()
    )

    if saved is None:
        saved = StudentLessonTopSignals(
            student_id=payload.student_id,
            lesson_id=payload.lesson_id,
            prediction_id=payload.prediction_id,
            predicted_cognitive_load=payload.predicted_cognitive_load,
        )
        db.add(saved)

    saved.prediction_id = payload.prediction_id
    saved.predicted_cognitive_load = payload.predicted_cognitive_load
    saved.predicted_score = payload.predicted_score
    saved.confidence = payload.confidence
    for rank in range(1, 4):
        signal = top_signals[rank - 1] if rank <= len(top_signals) else None
        setattr(saved, f"top_{rank}_signal", signal["signal"] if signal else None)
        setattr(saved, f"top_{rank}_value", float(signal["raw_value"]) if signal else None)
        setattr(
            saved,
            f"top_{rank}_normalized_value",
            float(signal["normalized_value"]) if signal else None,
        )

    if payload.lime_explanation is not None:
        saved.lime_explanation = payload.lime_explanation
    if payload.shap_explanation is not None:
        saved.shap_explanation = payload.shap_explanation
    if human_explanation is not None:
        saved.human_explanation = human_explanation
    if explanation_source is not None:
        saved.explanation_source = explanation_source
    if study_technique is not None:
        saved.study_technique = study_technique
        teacher_status = (study_technique.get("teacher_review") or {}).get("status")
        if teacher_status == "pending":
            saved.shared_to_student = False
            saved.shared_at = None
    if lecture_support is not None:
        saved.lecture_support = lecture_support

    db.commit()
    db.refresh(saved)
    return saved


def _top_signals_from_record(record: StudentLessonTopSignals) -> list[dict[str, Any]]:
    signals = []
    for rank in range(1, 4):
        signal = getattr(record, f"top_{rank}_signal")
        if signal is None:
            continue
        raw_value = float(getattr(record, f"top_{rank}_value") or 0.0)
        normalized_value = float(getattr(record, f"top_{rank}_normalized_value") or 0.0)
        signals.append(
            {
                "source": "combined",
                "signal": signal,
                "raw_value": raw_value,
                "strength": raw_value,
                "normalized_value": normalized_value,
                "normalized_strength": normalized_value,
                "impact": "positive",
            }
        )
    return signals


def _guidance_inputs(top_signals: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    signals = [_signal_to_teacher_phrase(item["signal"]) for item in top_signals]
    impact_phrases = {
        "positive": "behavior associated with increased cognitive load",
        "negative": "behavior that helped reduce cognitive load",
        "neutral": "observed behavior",
    }
    human_signals = [
        f"{impact_phrases[item['impact']]}: {_signal_to_teacher_phrase(item['signal'])}"
        for item in top_signals
    ]
    return signals, human_signals


def get_cached_student_lesson_analysis(
    db: Session,
    lesson_id: str,
    student_id: str,
) -> dict[str, Any]:
    record = (
        db.query(StudentLessonTopSignals)
        .filter(
            StudentLessonTopSignals.student_id == student_id,
            StudentLessonTopSignals.lesson_id == lesson_id,
        )
        .one_or_none()
    )

    # Old rows contain only top-three values. They are not complete cache hits
    # and should be regenerated once so every displayed section can be restored.
    complete = record is not None and all(
        value is not None
        for value in (
            record.lime_explanation,
            record.shap_explanation,
            record.human_explanation,
            record.study_technique,
            record.lecture_support,
        )
    )
    if not complete:
        return {
            "success": True,
            "message": "No complete saved analysis was found.",
            "data": None,
            "errors": [],
        }

    guidance_version = (
        record.study_technique.get("guidance_version")
        if isinstance(record.study_technique, dict)
        else None
    )
    guidance_refreshed = False
    if guidance_version != GUIDANCE_VERSION:
        top_signals = _top_signals_from_record(record)
        signals, human_signals = _guidance_inputs(top_signals)
        try:
            guidance = generate_student_guidance(
                student_id=record.student_id,
                lesson_id=record.lesson_id,
                predicted_label=record.predicted_cognitive_load,
                signals=signals,
                human_signals=human_signals,
            )
        except GeminiServiceError as exc:
            raise HTTPException(
                status_code=503,
                detail={
                    "success": False,
                    "message": str(exc),
                    "data": None,
                    "errors": ["Gemini could not refresh the teacher-friendly explanation."],
                },
            ) from exc
        record.human_explanation = guidance["human_explanation"]
        record.explanation_source = "gemini"
        record.study_technique = guidance["study_technique"]
        record.lecture_support = guidance["lecture_support"]
        record.shared_to_student = False
        record.shared_at = None
        db.commit()
        db.refresh(record)
        guidance_refreshed = True

    return {
        "success": True,
        "message": (
            "Saved LIME and SHAP analysis loaded; teacher guidance was refreshed."
            if guidance_refreshed
            else "Saved analysis retrieved successfully."
        ),
        "data": {
            "cached": True,
            "guidance_refreshed": guidance_refreshed,
            "lesson_id": record.lesson_id,
            "prediction_id": record.prediction_id,
            "student_id": record.student_id,
            "predicted_cognitive_load": record.predicted_cognitive_load,
            "predicted_score": record.predicted_score,
            "confidence": record.confidence,
            "lime_explanation": record.lime_explanation,
            "shap_explanation": record.shap_explanation,
            "aggregate_explanation": {
                "cached": True,
                "lesson_id": record.lesson_id,
                "prediction_id": record.prediction_id,
                "student_id": record.student_id,
                "predicted_cognitive_load": record.predicted_cognitive_load,
                "predicted_score": record.predicted_score,
                "confidence": record.confidence,
                "top_signals": _top_signals_from_record(record),
                "top_signals_record_id": record.id,
                "human_explanation": record.human_explanation,
                "explanation_source": record.explanation_source or "gemini",
                "study_technique": enrich_study_technique_payload(record.study_technique),
                "lecture_support": record.lecture_support,
                "shared_to_student": bool(record.shared_to_student),
                "shared_at": record.shared_at.isoformat() if record.shared_at else None,
            },
            "saved_at": record.updated_at.isoformat() if record.updated_at else None,
            "shared_to_student": bool(record.shared_to_student),
            "shared_at": record.shared_at.isoformat() if record.shared_at else None,
        },
        "errors": [],
    }


def share_student_lesson_guidance(
    db: Session,
    lesson_id: str,
    student_id: str,
) -> dict[str, Any]:
    record = (
        db.query(StudentLessonTopSignals)
        .filter(
            StudentLessonTopSignals.student_id == student_id,
            StudentLessonTopSignals.lesson_id == lesson_id,
        )
        .one_or_none()
    )
    if record is None or record.study_technique is None or record.lecture_support is None:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "message": "Run Raw Analyse before sending guidance to the student.",
                "data": None,
                "errors": [],
            },
        )

    now = datetime.now(timezone.utc)
    technique_payload = dict(record.study_technique)
    review = dict(technique_payload.get("teacher_review") or {})
    review.update(
        {
            "status": "approved",
            "reviewed_at": now.isoformat(),
            "rejection_reason": None,
        }
    )
    technique_payload["teacher_review"] = review
    record.study_technique = technique_payload
    record.shared_to_student = True
    record.shared_at = now
    db.commit()
    db.refresh(record)
    return {
        "success": True,
        "message": "Recommendation and study techniques sent to the student.",
        "data": {
            "student_id": record.student_id,
            "lesson_id": record.lesson_id,
            "shared_to_student": True,
            "shared_at": record.shared_at.isoformat() if record.shared_at else None,
            "teacher_review": review,
        },
        "errors": [],
    }


def reject_student_lesson_guidance(
    db: Session,
    lesson_id: str,
    student_id: str,
    decision: TeacherGuidanceDecision,
) -> dict[str, Any]:
    record = (
        db.query(StudentLessonTopSignals)
        .filter(
            StudentLessonTopSignals.student_id == student_id,
            StudentLessonTopSignals.lesson_id == lesson_id,
        )
        .one_or_none()
    )
    if record is None or not isinstance(record.study_technique, dict):
        raise HTTPException(status_code=404, detail={"message": "No generated guidance was found."})

    now = datetime.now(timezone.utc)
    technique_payload = dict(record.study_technique)
    review = dict(technique_payload.get("teacher_review") or {})
    review.update(
        {
            "status": "rejected",
            "reviewed_at": now.isoformat(),
            "rejection_reason": decision.reason.strip() or None,
        }
    )
    technique_payload["teacher_review"] = review
    record.study_technique = technique_payload
    record.shared_to_student = False
    record.shared_at = None
    db.commit()
    db.refresh(record)
    return {
        "success": True,
        "message": "Guidance rejected and withheld from the student.",
        "data": {
            "student_id": record.student_id,
            "lesson_id": record.lesson_id,
            "shared_to_student": False,
            "shared_at": None,
            "teacher_review": review,
        },
        "errors": [],
    }


def regenerate_student_lesson_guidance(
    db: Session,
    lesson_id: str,
    student_id: str,
) -> dict[str, Any]:
    record = (
        db.query(StudentLessonTopSignals)
        .filter(
            StudentLessonTopSignals.student_id == student_id,
            StudentLessonTopSignals.lesson_id == lesson_id,
        )
        .one_or_none()
    )
    if record is None:
        raise HTTPException(status_code=404, detail={"message": "No saved analysis was found."})

    top_signals = _top_signals_from_record(record)
    signals, human_signals = _guidance_inputs(top_signals)
    try:
        guidance = generate_student_guidance(
            student_id=record.student_id,
            lesson_id=record.lesson_id,
            predicted_label=record.predicted_cognitive_load,
            signals=signals,
            human_signals=human_signals,
        )
    except GeminiServiceError as exc:
        raise HTTPException(status_code=503, detail={"message": str(exc)}) from exc

    previous_payload = record.study_technique if isinstance(record.study_technique, dict) else {}
    previous_review = dict(previous_payload.get("teacher_review") or {})
    regeneration_count = int(previous_review.get("regeneration_count") or 0) + 1
    new_payload = dict(guidance["study_technique"])
    new_review = dict(new_payload["teacher_review"])
    new_review["regeneration_count"] = regeneration_count
    new_payload["teacher_review"] = new_review

    feedback_history = list(previous_payload.get("feedback_history") or [])
    previous_feedback = dict(previous_payload.get("student_feedback") or {})
    if previous_feedback:
        feedback_history.append(
            {
                "archived_at": datetime.now(timezone.utc).isoformat(),
                "guidance_version": previous_payload.get("guidance_version"),
                "feedback": previous_feedback,
            }
        )
    new_payload["feedback_history"] = feedback_history

    record.human_explanation = guidance["human_explanation"]
    record.explanation_source = "gemini"
    record.study_technique = new_payload
    record.lecture_support = guidance["lecture_support"]
    record.shared_to_student = False
    record.shared_at = None
    db.commit()
    db.refresh(record)
    return {
        "success": True,
        "message": "Guidance regenerated and is waiting for teacher review.",
        "data": {
            "human_explanation": record.human_explanation,
            "study_technique": enrich_study_technique_payload(record.study_technique),
            "lecture_support": record.lecture_support,
            "shared_to_student": False,
            "shared_at": None,
        },
        "errors": [],
    }


def save_student_technique_feedback(
    db: Session,
    lesson_id: str,
    student_id: str,
    feedback: TechniqueFeedbackRequest,
) -> dict[str, Any]:
    record = (
        db.query(StudentLessonTopSignals)
        .filter(
            StudentLessonTopSignals.student_id == student_id,
            StudentLessonTopSignals.lesson_id == lesson_id,
            StudentLessonTopSignals.shared_to_student.is_(True),
        )
        .one_or_none()
    )
    if record is None or not isinstance(record.study_technique, dict):
        raise HTTPException(status_code=404, detail={"message": "No approved guidance was found."})

    technique_name = feedback.technique.strip().lower()
    selected_names = {
        str(item.get("technique") or item.get("title") or "").strip().lower()
        for item in record.study_technique.get("techniques") or []
        if isinstance(item, dict)
    }
    if technique_name not in selected_names:
        raise HTTPException(status_code=400, detail={"message": "Feedback technique was not recommended."})
    if feedback.used and (feedback.helpfulness is None or feedback.ease_of_use is None):
        raise HTTPException(
            status_code=422,
            detail={"message": "Helpfulness and ease ratings are required after using a technique."},
        )

    submitted = {
        "technique": technique_name,
        "used": feedback.used,
        "helpfulness": feedback.helpfulness if feedback.used else None,
        "ease_of_use": feedback.ease_of_use if feedback.used else None,
        "comment": feedback.comment.strip() or None,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    technique_payload = dict(record.study_technique)
    feedback_by_technique = dict(technique_payload.get("student_feedback") or {})
    feedback_by_technique[technique_name] = submitted
    technique_payload["student_feedback"] = feedback_by_technique
    record.study_technique = technique_payload
    db.commit()
    db.refresh(record)
    return {
        "success": True,
        "message": "Thank you. Your study-technique feedback was saved.",
        "data": submitted,
        "errors": [],
    }


def list_shared_student_lesson_guidance(
    db: Session,
    student_id: str,
) -> dict[str, Any]:
    records = (
        db.query(StudentLessonTopSignals)
        .filter(
            StudentLessonTopSignals.student_id == student_id,
            StudentLessonTopSignals.shared_to_student.is_(True),
        )
        .order_by(StudentLessonTopSignals.shared_at.desc(), StudentLessonTopSignals.id.desc())
        .all()
    )
    return {
        "success": True,
        "message": "Shared previous-lesson guidance retrieved successfully.",
        "data": [
            {
                "student_id": record.student_id,
                "lesson_id": record.lesson_id,
                "predicted_cognitive_load": record.predicted_cognitive_load,
                "human_explanation": record.human_explanation,
                "lecture_support": record.lecture_support,
                "study_technique": enrich_study_technique_payload(record.study_technique),
                "top_signals": _top_signals_from_record(record),
                "shared_at": record.shared_at.isoformat() if record.shared_at else None,
            }
            for record in records
        ],
        "errors": [],
    }


def generate_aggregate_explanation(
    db: Session,
    payload: AggregateExplanationRequest,
) -> dict[str, Any]:
    lime_factors = [factor.model_dump(mode="json") for factor in payload.lime_factors]
    shap_values = [item.model_dump(mode="json") for item in payload.shap_values]
    top_signals = _top_aggregate_signals(
        lime_factors=lime_factors,
        shap_values=shap_values,
        limit=3,
    )

    signals, human_signals = _guidance_inputs(top_signals)

    try:
        guidance = generate_student_guidance(
            student_id=payload.student_id,
            lesson_id=payload.lesson_id,
            predicted_label=payload.predicted_cognitive_load,
            signals=signals,
            human_signals=human_signals,
        )
        explanation_text = guidance["human_explanation"]
        study_technique = guidance["study_technique"]
        lecture_support = guidance["lecture_support"]
    except GeminiServiceError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "success": False,
                "message": str(exc),
                "data": None,
                "errors": ["Gemini could not generate the requested student guidance."],
            },
        ) from exc

    saved_signals = _save_top_aggregate_signals(
        db,
        payload,
        top_signals,
        human_explanation=explanation_text,
        explanation_source="gemini",
        study_technique=study_technique,
        lecture_support=lecture_support,
    )

    return {
        "success": True,
        "message": "Aggregate explanation generated successfully.",
        "data": {
            "cached": False,
            "lesson_id": payload.lesson_id,
            "prediction_id": payload.prediction_id,
            "student_id": payload.student_id,
            "predicted_cognitive_load": payload.predicted_cognitive_load,
            "predicted_score": payload.predicted_score,
            "confidence": payload.confidence,
            "top_signals": top_signals,
            "top_signals_record_id": saved_signals.id,
            "human_explanation": explanation_text,
            "explanation_source": "gemini",
            "study_technique": study_technique,
            "lecture_support": lecture_support,
        },
        "errors": [],
    }


def _prediction_label(payload: dict[str, Any]) -> str:
    for key in ("predicted_cognitive_load", "predicted_label", "final_cognitive_load", "cognitive_load"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return "Medium"


def _prediction_score(payload: dict[str, Any]) -> int:
    for key in ("predicted_score", "score", "label_score", "cognitive_load_score"):
        value = payload.get(key)
        if value is None:
            continue
        try:
            return int(float(value))
        except (TypeError, ValueError):
            continue
    labels = {"Very Low": 1, "Low": 2, "Medium": 3, "High": 4, "Very High": 5}
    return labels.get(_prediction_label(payload), 3)


def _confidence(payload: dict[str, Any]) -> float:
    for key in ("confidence", "probability", "probability_score"):
        value = payload.get(key)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return 0.0


def save_prediction(db: Session, data: CognitiveLoadInput, prediction_payload: dict[str, Any]) -> CognitiveLoadPrediction:
    row = CognitiveLoadPrediction(
        student_id=data.student_id,
        lesson_id=data.lesson_id,
        session_id=data.session_id,
        minute_index=data.minute_index,
        window_start=data.window_start,
        window_end=data.window_end,
        pause_frequency=data.pause_frequency,
        navigation_count_video=data.navigation_count_video,
        rewatch_segments=data.rewatch_segments,
        playback_rate_change=data.playback_rate_change,
        idle_duration_video=data.idle_duration_video,
        time_on_content=data.time_on_content,
        **LEGACY_FEATURE_DEFAULTS,
        predicted_cognitive_load=_prediction_label(prediction_payload),
        predicted_score=_prediction_score(prediction_payload),
        confidence=_confidence(prediction_payload),
        created_at=datetime.now(timezone.utc),
    )

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def predict_and_store(db: Session, data: CognitiveLoadInput) -> dict[str, Any]:
    try:
        prediction_payload = request_prediction(data.model_dump(mode="json"))
    except ModelClientError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "success": False,
                "message": str(exc),
                "data": None,
                "errors": ["Model service is unavailable or misconfigured."],
            },
        ) from exc

    saved_row = save_prediction(db, data, prediction_payload)

    return {
        "success": True,
        "message": "Prediction stored successfully.",
        "data": {
            "id": saved_row.id,
            "student_id": saved_row.student_id,
            "lesson_id": saved_row.lesson_id,
            "session_id": saved_row.session_id,
            "minute_index": saved_row.minute_index,
            "window_start": saved_row.window_start.isoformat() if saved_row.window_start else None,
            "window_end": saved_row.window_end.isoformat() if saved_row.window_end else None,
            "pause_frequency": saved_row.pause_frequency,
            "navigation_count_video": saved_row.navigation_count_video,
            "rewatch_segments": saved_row.rewatch_segments,
            "playback_rate_change": saved_row.playback_rate_change,
            "idle_duration_video": saved_row.idle_duration_video,
            "time_on_content": saved_row.time_on_content,
            "predicted_cognitive_load": saved_row.predicted_cognitive_load,
            "predicted_score": saved_row.predicted_score,
            "confidence": saved_row.confidence,
            "created_at": saved_row.created_at.isoformat() if saved_row.created_at else None,
            "model_response": prediction_payload,
        },
        "errors": [],
    }


def list_predictions(db: Session, limit: int = 50) -> dict[str, Any]:
    rows = (
        db.query(CognitiveLoadPrediction)
        .order_by(CognitiveLoadPrediction.created_at.desc(), CognitiveLoadPrediction.id.desc())
        .limit(limit)
        .all()
    )

    return {
        "success": True,
        "message": "Predictions retrieved successfully.",
        "data": [
            {
                "id": row.id,
                "student_id": row.student_id,
                "lesson_id": row.lesson_id,
                "session_id": row.session_id,
                "minute_index": row.minute_index,
                "window_start": row.window_start.isoformat() if row.window_start else None,
                "window_end": row.window_end.isoformat() if row.window_end else None,
                "pause_frequency": row.pause_frequency,
                "navigation_count_video": row.navigation_count_video,
                "rewatch_segments": row.rewatch_segments,
                "playback_rate_change": row.playback_rate_change,
                "idle_duration_video": row.idle_duration_video,
                "time_on_content": row.time_on_content,
                "predicted_cognitive_load": row.predicted_cognitive_load,
                "predicted_score": row.predicted_score,
                "confidence": row.confidence,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
        "errors": [],
    }


def list_lessons(db: Session) -> dict[str, Any]:
    rows = (
        db.query(
            CognitiveLoadPrediction.lesson_id,
            func.count(CognitiveLoadPrediction.id).label("prediction_count"),
        )
        .group_by(CognitiveLoadPrediction.lesson_id)
        .order_by(CognitiveLoadPrediction.lesson_id.asc())
        .all()
    )

    return {
        "success": True,
        "message": "Lessons retrieved successfully.",
        "data": [
            {
                "lesson_id": row.lesson_id,
                "prediction_count": int(row.prediction_count),
            }
            for row in rows
        ],
        "errors": [],
    }


def list_students_for_lesson(db: Session, lesson_id: str) -> dict[str, Any]:
    rows = (
        db.query(
            CognitiveLoadPrediction.student_id,
            func.count(CognitiveLoadPrediction.id).label("prediction_count"),
        )
        .filter(CognitiveLoadPrediction.lesson_id == lesson_id)
        .group_by(CognitiveLoadPrediction.student_id)
        .order_by(CognitiveLoadPrediction.student_id.asc())
        .all()
    )

    return {
        "success": True,
        "message": "Students retrieved successfully.",
        "data": [
            {
                "student_id": row.student_id,
                "prediction_count": int(row.prediction_count),
            }
            for row in rows
        ],
        "errors": [],
    }


def get_student_lesson_cognitive_load_counts(
    db: Session,
    lesson_id: str,
    student_id: str,
) -> dict[str, Any]:
    rows = (
        db.query(
            CognitiveLoadPrediction.predicted_cognitive_load,
            func.count(CognitiveLoadPrediction.id).label("load_count"),
        )
        .filter(
            CognitiveLoadPrediction.lesson_id == lesson_id,
            CognitiveLoadPrediction.student_id == student_id,
        )
        .group_by(CognitiveLoadPrediction.predicted_cognitive_load)
        .all()
    )
    severity = {"Very High": 5, "High": 4, "Medium": 3, "Low": 2, "Very Low": 1}
    counts = {
        str(row.predicted_cognitive_load): int(row.load_count)
        for row in rows
    }
    dominant = max(
        counts,
        key=lambda label: (counts[label], severity.get(label, 0), label),
        default=None,
    )
    return {
        "success": True,
        "message": "Cognitive-load counts retrieved successfully.",
        "data": {
            "student_id": student_id,
            "lesson_id": lesson_id,
            "counts": counts,
            "total_predictions": sum(counts.values()),
            "dominant_cognitive_load": dominant,
        },
        "errors": [],
    }


def list_predictions_filtered(
    db: Session,
    lesson_id: str,
    student_id: str | None = None,
    high_only: bool = False,
    include_medium: bool = False,
    limit: int = 200,
) -> dict[str, Any]:
    query = db.query(CognitiveLoadPrediction).filter(CognitiveLoadPrediction.lesson_id == lesson_id)

    if student_id:
        query = query.filter(CognitiveLoadPrediction.student_id == student_id)

    if high_only:
        if include_medium:
            query = query.filter(CognitiveLoadPrediction.predicted_cognitive_load.in_(["Medium", "High", "Very High"]))
        else:
            query = query.filter(CognitiveLoadPrediction.predicted_cognitive_load.in_(["High", "Very High"]))

    rows = (
        query
        .order_by(CognitiveLoadPrediction.created_at.desc(), CognitiveLoadPrediction.id.desc())
        .limit(limit)
        .all()
    )

    return {
        "success": True,
        "message": "Predictions retrieved successfully.",
        "data": [
            {
                "id": row.id,
                "student_id": row.student_id,
                "lesson_id": row.lesson_id,
                "session_id": row.session_id,
                "minute_index": row.minute_index,
                "window_start": row.window_start.isoformat() if row.window_start else None,
                "window_end": row.window_end.isoformat() if row.window_end else None,
                "pause_frequency": row.pause_frequency,
                "navigation_count_video": row.navigation_count_video,
                "rewatch_segments": row.rewatch_segments,
                "playback_rate_change": row.playback_rate_change,
                "idle_duration_video": row.idle_duration_video,
                "time_on_content": row.time_on_content,
                "predicted_cognitive_load": row.predicted_cognitive_load,
                "predicted_score": row.predicted_score,
                "confidence": row.confidence,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
        "errors": [],
    }


def _get_majority_cognitive_load(labels: list[str]) -> str:
    """Get the most frequent cognitive load level."""
    from collections import Counter
    if not labels:
        return "Medium"
    counts = Counter(labels)
    return counts.most_common(1)[0][0]


def aggregate_and_save_student_lesson_summary(
    db: Session,
    lesson_id: str,
    student_id: str,
) -> dict[str, Any]:
    """Aggregate all predictions for a student-lesson and save to summary table."""
    rows = (
        db.query(CognitiveLoadPrediction)
        .filter(
            CognitiveLoadPrediction.lesson_id == lesson_id,
            CognitiveLoadPrediction.student_id == student_id,
        )
        .all()
    )

    if not rows:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "message": f"No predictions found for student {student_id} in lesson {lesson_id}.",
                "data": None,
                "errors": [],
            },
        )

    # Calculate averages
    numeric_fields = RAW_FEATURE_FIELDS
    
    aggregated_features = {}
    for field in numeric_fields:
        values = [float(getattr(row, field)) for row in rows]
        aggregated_features[field] = sum(values) / len(values) if values else 0.0

    # Get majority cognitive load
    cognitive_loads = [row.predicted_cognitive_load for row in rows]
    majority_load = _get_majority_cognitive_load(cognitive_loads)

    # Calculate average confidence and score
    confidences = [row.confidence for row in rows]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    
    scores = [row.predicted_score for row in rows]
    avg_score = int(sum(scores) / len(scores)) if scores else 0

    # Create or update summary
    summary = (
        db.query(StudentLessonSummary)
        .filter(
            StudentLessonSummary.student_id == student_id,
            StudentLessonSummary.lesson_id == lesson_id,
        )
        .first()
    )

    if summary:
        # Update existing
        summary.pause_frequency = aggregated_features["pause_frequency"]
        summary.navigation_count_video = aggregated_features["navigation_count_video"]
        summary.rewatch_segments = aggregated_features["rewatch_segments"]
        summary.playback_rate_change = aggregated_features["playback_rate_change"]
        summary.idle_duration_video = aggregated_features["idle_duration_video"]
        summary.time_on_content = aggregated_features["time_on_content"]
        summary.predicted_cognitive_load = majority_load
        summary.predicted_score = avg_score
        summary.confidence = avg_confidence
        summary.record_count = len(rows)
        summary.updated_at = datetime.now(timezone.utc)
    else:
        # Create new
        summary = StudentLessonSummary(
            student_id=student_id,
            lesson_id=lesson_id,
            session_id=rows[0].session_id if rows else None,
            minute_index=0,
            window_start=rows[0].window_start if rows else None,
            window_end=rows[-1].window_end if rows else None,
            pause_frequency=aggregated_features["pause_frequency"],
            navigation_count_video=aggregated_features["navigation_count_video"],
            rewatch_segments=aggregated_features["rewatch_segments"],
            playback_rate_change=aggregated_features["playback_rate_change"],
            idle_duration_video=aggregated_features["idle_duration_video"],
            time_on_content=aggregated_features["time_on_content"],
            **LEGACY_FEATURE_DEFAULTS,
            predicted_cognitive_load=majority_load,
            predicted_score=avg_score,
            confidence=avg_confidence,
            record_count=len(rows),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

    db.add(summary)
    db.commit()
    db.refresh(summary)

    return {
        "success": True,
        "message": "Student-lesson summary aggregated and saved successfully.",
        "data": {
            "id": summary.id,
            "student_id": summary.student_id,
            "lesson_id": summary.lesson_id,
            "session_id": summary.session_id,
            "minute_index": summary.minute_index,
            "window_start": summary.window_start.isoformat() if summary.window_start else None,
            "window_end": summary.window_end.isoformat() if summary.window_end else None,
            "pause_frequency": summary.pause_frequency,
            "navigation_count_video": summary.navigation_count_video,
            "rewatch_segments": summary.rewatch_segments,
            "playback_rate_change": summary.playback_rate_change,
            "idle_duration_video": summary.idle_duration_video,
            "time_on_content": summary.time_on_content,
            "predicted_cognitive_load": summary.predicted_cognitive_load,
            "predicted_score": summary.predicted_score,
            "confidence": summary.confidence,
            "record_count": summary.record_count,
            "created_at": summary.created_at.isoformat() if summary.created_at else None,
            "updated_at": summary.updated_at.isoformat() if summary.updated_at else None,
        },
        "errors": [],
    }


def _predict_scores_for_matrix(feature_matrix: np.ndarray) -> np.ndarray:
    return predict_scores(feature_matrix)


def get_lime_explanation_for_prediction(
    db: Session,
    lesson_id: str,
    prediction_id: int,
    num_features: int = 6,
    num_samples: int = 200,
) -> dict[str, Any]:
    # Only look in StudentLessonSummary
    target_row = (
        db.query(StudentLessonSummary)
        .filter(
            StudentLessonSummary.id == prediction_id,
            StudentLessonSummary.lesson_id == lesson_id,
        )
        .first()
    )

    if target_row is None:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "message": "Prediction record not found for the selected lesson.",
                "data": None,
                "errors": [],
            },
        )

    # Get training data from CognitiveLoadPrediction for context
    lesson_rows = (
        db.query(CognitiveLoadPrediction)
        .filter(CognitiveLoadPrediction.lesson_id == lesson_id)
        .order_by(CognitiveLoadPrediction.created_at.desc(), CognitiveLoadPrediction.id.desc())
        .limit(50)
        .all()
    )

    if not lesson_rows:
        lesson_rows = [target_row]

    training_data = np.asarray(
        [
            [float(getattr(row, name)) for name in RAW_FEATURE_FIELDS]
            for row in lesson_rows
        ],
        dtype=float,
    )

    target_vector = np.asarray(
        [float(getattr(target_row, name)) for name in RAW_FEATURE_FIELDS],
        dtype=float,
    )

    explainer = LimeTabularExplainer(
        training_data=training_data,
        feature_names=RAW_FEATURE_FIELDS,
        mode="regression",
        discretize_continuous=True,
        random_state=42,
    )

    try:
        explanation = explainer.explain_instance(
            data_row=target_vector,
            predict_fn=_predict_scores_for_matrix,
            num_features=max(1, min(num_features, len(RAW_FEATURE_FIELDS))),
            num_samples=max(50, num_samples),
        )
    except (ModelClientError, LocalModelError) as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "success": False,
                "message": str(exc),
                "data": None,
                "errors": ["Model service is unavailable while generating LIME explanation."],
            },
        ) from exc

    factors = [
        {
            "rule": rule,
            "weight": float(weight),
            "impact": "positive" if weight > 0 else "negative" if weight < 0 else "neutral",
        }
        for rule, weight in explanation.as_list()
    ]

    return {
        "success": True,
        "message": "LIME explanation generated successfully.",
        "data": {
            "prediction_id": target_row.id,
            "lesson_id": target_row.lesson_id,
            "student_id": target_row.student_id,
            "predicted_cognitive_load": target_row.predicted_cognitive_load,
            "predicted_score": target_row.predicted_score,
            "confidence": target_row.confidence,
            "intercept": float(explanation.intercept[0]) if explanation.intercept else 0.0,
            "factors": factors,
        },
        "errors": [],
    }
