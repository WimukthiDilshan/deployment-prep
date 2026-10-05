from typing import Literal

from pydantic import BaseModel, Field

CognitiveLoadLabel = Literal["Very Low", "Low", "Medium", "High", "Very High"]


class SummaryAverages(BaseModel):
    avg_pause_frequency: float | None = None
    avg_navigation_count_video: float | None = None
    avg_rewatch_segments: float | None = None
    avg_playback_rate_change: float | None = None
    avg_idle_duration_video: float | None = None
    avg_time_on_content: float | None = None
    avg_navigation_count_adaptation: float | None = None
    avg_revisit_frequency: float | None = None
    avg_idle_duration_adaptation: float | None = None
    avg_quiz_response_time: float | None = None
    avg_error_rate: float | None = None


class SummaryCounts(BaseModel):
    very_low: int = Field(default=0, alias="Very Low")
    low: int = Field(default=0, alias="Low")
    medium: int = Field(default=0, alias="Medium")
    high: int = Field(default=0, alias="High")
    very_high: int = Field(default=0, alias="Very High")

    class Config:
        populate_by_name = True


class StudentSummaryInput(BaseModel):
    averages: SummaryAverages
    counts: SummaryCounts


class ExplainRequest(BaseModel):
    summary: StudentSummaryInput
    final_cognitive_load: CognitiveLoadLabel


class ExplanationFactor(BaseModel):
    feature: str
    value: float | None = None
    score: float
    impact: Literal["negative", "neutral", "positive"]
    reason: str


class ExplainResponse(BaseModel):
    shap_top_factors: list[ExplanationFactor]
    lime_top_factors: list[ExplanationFactor]
    agreed_top_factors: list[ExplanationFactor]
    explanation_text: str
    recommendation_text: str


class GeneratedStudentExplanation(BaseModel):
    student_id: int
    lesson_id: int
    final_cognitive_load: CognitiveLoadLabel
    averages: SummaryAverages
    shap_top_factors: list[ExplanationFactor]
    lime_top_factors: list[ExplanationFactor]
    agreed_top_factors: list[ExplanationFactor]
    explanation_text: str
    recommendation_text: str
    saved_row_id: int | None = None


class GenerateStudentExplanationsResponse(BaseModel):
    lesson_id: int
    count: int
    items: list[GeneratedStudentExplanation]
