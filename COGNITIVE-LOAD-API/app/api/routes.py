from fastapi import APIRouter

from app.core.database import get_db_status
from app.core.model_loader import get_model_metadata
from app.schemas.event import ALLOWED_RAW_EVENT_TYPES, RawInteractionEventInput
from app.schemas.feature_window import FeatureWindowInput
from app.schemas.prediction import CognitiveLoadInput
from app.schemas.raw_prediction import RawPredictionInput
from app.services.db_service import save_feature_window, save_raw_interaction_event
from app.services.lime_dispatch_service import process_completed_windows_for_event
from app.services.prediction_service import (
    get_prediction_logs,
    predict_cognitive_load,
    predict_cognitive_load_from_raw,
)
from app.services.trend_analysis_service import analyze_cognitive_load_trend


router = APIRouter()


@router.get("/")
def root():
    # Quick health check endpoint for confirming the API is up.
    return {"message": "Cognitive Load Prediction API is running"}


@router.get("/health")
def health():
    return {
        "service": "cognitive-load-api",
        "status": "ok",
        "database": get_db_status(),
        "model": get_model_metadata(),
        "allowed_event_types": ALLOWED_RAW_EVENT_TYPES,
    }


@router.post("/predict")
def predict(data: CognitiveLoadInput):
    # Predict cognitive load from a precomputed feature payload.
    return predict_cognitive_load(data)


@router.post("/predict/from-raw")
def predict_from_raw(data: RawPredictionInput):
    # Accept raw interaction inputs and run the full extraction + prediction flow.
    return predict_cognitive_load_from_raw(data)


@router.post("/events/raw")
def create_raw_event(data: RawInteractionEventInput):
    # This endpoint is mainly for the frontend event logger.
    event_id = save_raw_interaction_event(data.model_dump())
    automation_result = process_completed_windows_for_event(data.model_dump())
    return {
        "message": "Raw interaction event processed",
        "saved_to_mysql": event_id is not None,
        "id": event_id,
        "auto_dispatch": automation_result,
    }


@router.post("/feature-windows")
def create_feature_window(data: FeatureWindowInput):
    # Keeping this separate is useful for manual testing or future scheduled extraction jobs.
    feature_window_id = save_feature_window(data.model_dump())
    return {
        "message": "Feature window processed",
        "saved_to_mysql": feature_window_id is not None,
        "id": feature_window_id,
    }


@router.get("/xai/data")
def get_xai_data(
    student_id: str | None = None,
    lesson_id: str | None = None,
    minute_index: int | None = None,
):
    # Read-only route for teammates who need prediction-ready records.
    # Optional query filters help narrow logs to a student, lesson, or minute.
    return get_prediction_logs(
        student_id=student_id,
        lesson_id=lesson_id,
        minute_index=minute_index,
    )


@router.get("/students/{student_id}/lessons/{lesson_id}/load-trend")
def get_load_trend(
    student_id: str,
    lesson_id: str,
    session_id: str | None = None,
    limit: int = 12,
):
    # Temporal analytics layer on top of saved cognitive-load predictions.
    return analyze_cognitive_load_trend(
        student_id=student_id,
        lesson_id=lesson_id,
        session_id=session_id,
        limit=limit,
    )
