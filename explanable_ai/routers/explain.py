from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from config.database import get_db
from models.api_response_models import (
    ApiResponse,
    HighLoadPeriodListData,
    LessonOverviewList,
    LessonStudentsData,
    PeriodExplanationData,
    StudentExplanationData,
)
from models.class_summary_models import ClassRecommendationRequest, ClassRecommendationResponse, ClassSummary
from models.explanation_models import (
    ExplainRequest,
    ExplainResponse,
    GenerateStudentExplanationsResponse,
)
from services.explanation_service import build_explanation
from services.class_summary_service import generate_class_summary
from services.class_recommendation_service import generate_class_recommendation
from services.lesson_explanation_generation_service import generate_student_explanations_for_lesson
from services.lesson_lookup_service import list_lessons, list_students_for_lesson
from services.high_load_period_service import explain_high_load_period, list_high_load_periods
from services.student_explanation_service import generate_student_explanation_preview

router = APIRouter(tags=["explainability"])


def _ok(message: str, data: object | None = None) -> dict[str, object | None]:
    """Wrap successful responses in a frontend-friendly JSON envelope."""
    return {
        "success": True,
        "message": message,
        "data": data,
        "errors": [],
    }


@router.post("/explain", response_model=ExplainResponse)
def explain(request: ExplainRequest) -> ExplainResponse:
    """Return a standalone explainability response for a custom summary payload."""
    return build_explanation(request)


@router.get("/lessons", response_model=ApiResponse[LessonOverviewList])
def get_lessons(db: Session = Depends(get_db)) -> dict[str, object | None]:
    """Return all lessons available for the lesson selector."""
    lessons = list_lessons(db)
    return _ok("Lessons retrieved successfully.", {"lessons": lessons})


@router.get("/lessons/{lesson_id}/students", response_model=ApiResponse[LessonStudentsData])
def get_lesson_students(
    lesson_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
) -> dict[str, object | None]:
    """Return the list of students for one lesson."""
    students = list_students_for_lesson(db, lesson_id)
    return _ok("Lesson students retrieved successfully.", students)


@router.get(
    "/students/{student_id}/lessons/{lesson_id}/explanation",
    response_model=ApiResponse[StudentExplanationData],
)
def get_student_lesson_explanation(
    student_id: int = Path(..., gt=0),
    lesson_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
) -> dict[str, object | None]:
    """Return the read-only explanation view for one student in one lesson."""
    explanation = generate_student_explanation_preview(db, student_id, lesson_id)
    return _ok("Student explanation retrieved successfully.", explanation)


@router.get(
    "/students/{student_id}/lessons/{lesson_id}/high-load-periods",
    response_model=ApiResponse[HighLoadPeriodListData],
)
def get_student_high_load_periods(
    student_id: int = Path(..., gt=0),
    lesson_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
) -> dict[str, object | None]:
    """Return high-load periods (High/Very High) for one student in one lesson."""
    periods = list_high_load_periods(db, student_id, lesson_id)
    return _ok("High-load periods retrieved successfully.", periods)


@router.get(
    "/students/{student_id}/lessons/{lesson_id}/high-load-periods/{period_id}/explanation",
    response_model=ApiResponse[PeriodExplanationData],
)
def get_student_high_load_period_explanation(
    student_id: int = Path(..., gt=0),
    lesson_id: int = Path(..., gt=0),
    period_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
) -> dict[str, object | None]:
    """Return SHAP/LIME explanation for one selected high-load period."""
    explanation = explain_high_load_period(db, student_id, lesson_id, period_id)
    return _ok("High-load period explanation retrieved successfully.", explanation)


@router.get("/lessons/{lesson_id}/class-summary", response_model=ApiResponse[ClassSummary])
def get_lesson_class_summary(
    lesson_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
) -> dict[str, object | None]:
    """Return the saved class summary for one lesson."""
    summary = generate_class_summary(db, lesson_id)
    return _ok("Class summary retrieved successfully.", summary)


@router.post(
    "/lessons/{lesson_id}/generate-student-explanations",
    response_model=GenerateStudentExplanationsResponse,
)
def generate_lesson_student_explanations(
    lesson_id: int,
    db: Session = Depends(get_db),
) -> GenerateStudentExplanationsResponse:
    """Generate and save student explanations for every student in the lesson."""
    return generate_student_explanations_for_lesson(db, lesson_id)


@router.post(
    "/lessons/{lesson_id}/generate-class-recommendation",
    response_model=ClassRecommendationResponse,
)
def generate_lesson_class_recommendation(
    lesson_id: int,
    request: ClassRecommendationRequest,
    db: Session = Depends(get_db),
) -> ClassRecommendationResponse:
    """Generate and save the class recommendation for the lesson."""
    class_summary = request.class_summary.model_copy(update={"lesson_id": lesson_id})
    return generate_class_recommendation(db, class_summary)
