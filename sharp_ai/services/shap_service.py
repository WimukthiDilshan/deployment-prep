from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
import numpy as np
import shap
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.prediction import CognitiveLoadPrediction
from models.student_lesson_summary import StudentLessonSummary
from services.local_model import LocalModelError, predict_scores


RAW_FEATURE_FIELDS = [
    "pause_frequency",
    "navigation_count_video",
    "rewatch_segments",
    "playback_rate_change",
    "idle_duration_video",
    "time_on_content",
]

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


def _predict_scores_for_matrix(feature_matrix: np.ndarray) -> np.ndarray:
    return predict_scores(feature_matrix)


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


def list_predictions_filtered(
    db: Session,
    lesson_id: str,
    student_id: str | None = None,
    high_only: bool = False,
    limit: int = 200,
) -> dict[str, Any]:
    query = db.query(CognitiveLoadPrediction).filter(CognitiveLoadPrediction.lesson_id == lesson_id)

    if student_id:
        query = query.filter(CognitiveLoadPrediction.student_id == student_id)

    if high_only:
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


def get_shap_explanation_for_prediction(
    db: Session,
    lesson_id: str,
    prediction_id: int,
    num_features: int = 6,
    num_samples: int = 100,
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

    background_data = np.asarray(
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

    unique_background = np.unique(background_data, axis=0)
    cluster_count = min(10, len(unique_background))
    summarized_background = (
        shap.kmeans(unique_background, cluster_count)
        if cluster_count > 1
        else unique_background
    )
    explainer = shap.KernelExplainer(
        _predict_scores_for_matrix,
        summarized_background,
    )

    try:
        shap_values = explainer.shap_values(
            target_vector,
            nsamples=max(25, num_samples),
        )
    except LocalModelError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "success": False,
                "message": str(exc),
                "data": None,
                "errors": ["Model service is unavailable while generating SHAP explanation."],
            },
        ) from exc

    shap_array = np.asarray(shap_values, dtype=float).reshape(-1)
    if shap_array.shape[0] != len(RAW_FEATURE_FIELDS):
        shap_array = shap_array[: len(RAW_FEATURE_FIELDS)]

    feature_rows = []
    for index, feature_name in enumerate(RAW_FEATURE_FIELDS):
        shap_value = float(shap_array[index]) if index < len(shap_array) else 0.0
        feature_value = float(getattr(target_row, feature_name))
        feature_rows.append(
            {
                "feature": feature_name,
                "value": feature_value,
                "shap_value": shap_value,
                "impact": "positive" if shap_value > 0 else "negative" if shap_value < 0 else "neutral",
            }
        )

    top_features = sorted(feature_rows, key=lambda item: abs(item["shap_value"]), reverse=True)[: max(1, num_features)]
    positive = [item for item in top_features if item["impact"] == "positive"]
    negative = [item for item in top_features if item["impact"] == "negative"]

    if positive and negative:
        summary = (
            f"SHAP shows both pressure and relief signals for this student. "
            f"Strongest positive drivers: {', '.join(item['feature'] for item in positive[:3])}. "
            f"Strongest negative drivers: {', '.join(item['feature'] for item in negative[:3])}."
        )
    elif positive:
        summary = (
            f"SHAP suggests these features are pushing the prediction higher: "
            f"{', '.join(item['feature'] for item in positive[:3])}."
        )
    elif negative:
        summary = (
            f"SHAP suggests these features are pulling the prediction lower: "
            f"{', '.join(item['feature'] for item in negative[:3])}."
        )
    else:
        summary = "SHAP did not surface any strong directional feature contributions for this prediction."

    expected_value = explainer.expected_value
    if isinstance(expected_value, (list, tuple, np.ndarray)):
        expected_value = float(np.asarray(expected_value).reshape(-1)[0])
    else:
        expected_value = float(expected_value)

    return {
        "success": True,
        "message": "SHAP explanation generated successfully.",
        "data": {
            "prediction_id": target_row.id,
            "lesson_id": target_row.lesson_id,
            "student_id": target_row.student_id,
            "predicted_cognitive_load": target_row.predicted_cognitive_load,
            "predicted_score": target_row.predicted_score,
            "confidence": target_row.confidence,
            "expected_value": expected_value,
            "shap_values": feature_rows,
            "top_features": top_features,
            "summary": summary,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "errors": [],
    }
