from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from config.database import get_db
from schemas.prediction import (
    AggregateExplanationRequest,
    CognitiveLoadInput,
    TechniqueFeedbackRequest,
    TeacherGuidanceDecision,
)
from services.prediction_service import (
    aggregate_and_save_student_lesson_summary,
    generate_aggregate_explanation,
    get_cached_student_lesson_analysis,
    get_student_lesson_cognitive_load_counts,
    get_lime_explanation_for_prediction,
    list_lessons,
    list_shared_student_lesson_guidance,
    list_predictions,
    list_predictions_filtered,
    list_students_for_lesson,
    predict_and_store,
    regenerate_student_lesson_guidance,
    reject_student_lesson_guidance,
    save_student_technique_feedback,
    share_student_lesson_guidance,
)


router = APIRouter(tags=["lime-ai"])


@router.get("/health")
def health() -> dict[str, object]:
    return {
        "success": True,
        "message": "LIME AI Service is running.",
        "data": None,
        "errors": [],
    }


@router.post("/predict")
def predict(data: CognitiveLoadInput, db: Session = Depends(get_db)):
    return predict_and_store(db, data)


@router.get("/predictions")
def get_predictions(limit: int = 50, db: Session = Depends(get_db)):
    return list_predictions(db, limit=limit)


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
    include_medium: bool = False,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    return list_predictions_filtered(
        db,
        lesson_id=lesson_id,
        student_id=student_id,
        high_only=high_only,
        include_medium=include_medium,
        limit=limit,
    )


@router.post("/lessons/{lesson_id}/students/{student_id}/summary")
def create_student_lesson_summary(
    lesson_id: str,
    student_id: str,
    db: Session = Depends(get_db),
):
    return aggregate_and_save_student_lesson_summary(db, lesson_id, student_id)


@router.get("/lessons/{lesson_id}/students/{student_id}/analysis")
def get_student_lesson_analysis(
    lesson_id: str,
    student_id: str,
    db: Session = Depends(get_db),
):
    return get_cached_student_lesson_analysis(db, lesson_id, student_id)


@router.get("/lessons/{lesson_id}/students/{student_id}/cognitive-load-counts")
def get_student_lesson_load_counts(
    lesson_id: str,
    student_id: str,
    db: Session = Depends(get_db),
):
    return get_student_lesson_cognitive_load_counts(db, lesson_id, student_id)


@router.post("/lessons/{lesson_id}/students/{student_id}/share-guidance")
def share_student_guidance(
    lesson_id: str,
    student_id: str,
    db: Session = Depends(get_db),
):
    return share_student_lesson_guidance(db, lesson_id, student_id)


@router.post("/lessons/{lesson_id}/students/{student_id}/reject-guidance")
def reject_student_guidance(
    lesson_id: str,
    student_id: str,
    decision: TeacherGuidanceDecision,
    db: Session = Depends(get_db),
):
    return reject_student_lesson_guidance(db, lesson_id, student_id, decision)


@router.post("/lessons/{lesson_id}/students/{student_id}/regenerate-guidance")
def regenerate_student_guidance(
    lesson_id: str,
    student_id: str,
    db: Session = Depends(get_db),
):
    return regenerate_student_lesson_guidance(db, lesson_id, student_id)


@router.get("/students/{student_id}/shared-guidance")
def get_shared_student_guidance(student_id: str, db: Session = Depends(get_db)):
    return list_shared_student_lesson_guidance(db, student_id)


@router.post("/students/{student_id}/lessons/{lesson_id}/technique-feedback")
def submit_student_technique_feedback(
    student_id: str,
    lesson_id: str,
    feedback: TechniqueFeedbackRequest,
    db: Session = Depends(get_db),
):
    return save_student_technique_feedback(db, lesson_id, student_id, feedback)


@router.get("/lessons/{lesson_id}/predictions/{prediction_id}/lime")
def get_prediction_lime_explanation(
    lesson_id: str,
    prediction_id: int,
    num_features: int = 6,
    num_samples: int = 200,
    db: Session = Depends(get_db),
):
    return get_lime_explanation_for_prediction(
        db,
        lesson_id=lesson_id,
        prediction_id=prediction_id,
        num_features=num_features,
        num_samples=num_samples,
    )


@router.post("/aggregate-explanation")
def create_aggregate_explanation(
    payload: AggregateExplanationRequest,
    db: Session = Depends(get_db),
):
    return generate_aggregate_explanation(db, payload)
