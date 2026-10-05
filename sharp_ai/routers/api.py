from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from config.database import get_db
from services.shap_service import (
    get_shap_explanation_for_prediction,
    list_lessons,
    list_predictions_filtered,
    list_students_for_lesson,
)


router = APIRouter(tags=["shap-ai"])


@router.get("/health")
def health() -> dict[str, object]:
    return {
        "success": True,
        "message": "SHAP AI Service is running.",
        "data": None,
        "errors": [],
    }


@router.get("/lessons")
def get_lessons(db: Session = Depends(get_db)):
    return list_lessons(db)


@router.get("/lessons/{lesson_id}/students")
def get_lesson_students(lesson_id: str, db: Session = Depends(get_db)):
    return list_students_for_lesson(db, lesson_id)


@router.get("/lessons/{lesson_id}/predictions")
def get_lesson_predictions(
    lesson_id: str,
    student_id: str | None = None,
    high_only: bool = False,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    return list_predictions_filtered(
        db,
        lesson_id=lesson_id,
        student_id=student_id,
        high_only=high_only,
        limit=limit,
    )


@router.get("/lessons/{lesson_id}/predictions/{prediction_id}/shap")
def get_prediction_shap_explanation(
    lesson_id: str,
    prediction_id: int,
    num_features: int = 6,
    num_samples: int = 100,
    db: Session = Depends(get_db),
):
    return get_shap_explanation_for_prediction(
        db,
        lesson_id=lesson_id,
        prediction_id=prediction_id,
        num_features=num_features,
        num_samples=num_samples,
    )
