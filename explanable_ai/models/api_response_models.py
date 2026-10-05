from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

from models.explanation_models import ExplanationFactor, StudentSummaryInput

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    message: str
    data: T | None = None
    errors: list[str] = Field(default_factory=list)


class LessonOverviewItem(BaseModel):
    lesson_id: int
    total_students: int


class LessonOverviewList(BaseModel):
    lessons: list[LessonOverviewItem]


class StudentItem(BaseModel):
    student_id: int


class LessonStudentsData(BaseModel):
    lesson_id: int
    total_students: int
    students: list[StudentItem]


class StudentExplanationData(BaseModel):
    student_id: int
    lesson_id: int
    summary: StudentSummaryInput
    final_cognitive_load: str | None = None
    shap_top_factors: list[ExplanationFactor]
    lime_top_factors: list[ExplanationFactor]
    agreed_top_factors: list[ExplanationFactor]
    explanation_text: str
    recommendation_text: str


class HighLoadPeriodItem(BaseModel):
    period_id: int
    start_time: str | None = None
    end_time: str | None = None
    row_count: int
    dominant_cognitive_load: str


class HighLoadPeriodListData(BaseModel):
    student_id: int
    lesson_id: int
    periods: list[HighLoadPeriodItem]


class PeriodExplanationData(BaseModel):
    student_id: int
    lesson_id: int
    period_id: int
    start_time: str | None = None
    end_time: str | None = None
    row_count: int
    summary: StudentSummaryInput
    final_cognitive_load: str | None = None
    shap_top_factors: list[ExplanationFactor]
    lime_top_factors: list[ExplanationFactor]
    agreed_top_factors: list[ExplanationFactor]
    explanation_text: str
    recommendation_text: str
