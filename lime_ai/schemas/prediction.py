from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CognitiveLoadInput(BaseModel):
    student_id: str
    lesson_id: str
    session_id: str | None = None
    minute_index: int = 1
    window_start: datetime | None = None
    window_end: datetime | None = None

    pause_frequency: int
    navigation_count_video: int
    rewatch_segments: int
    playback_rate_change: int
    idle_duration_video: int
    time_on_content: int


class PredictionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: str
    lesson_id: str
    session_id: str | None
    minute_index: int
    window_start: datetime | None
    window_end: datetime | None
    pause_frequency: int
    navigation_count_video: int
    rewatch_segments: int
    playback_rate_change: int
    idle_duration_video: int
    time_on_content: int
    predicted_cognitive_load: str
    predicted_score: int
    confidence: float
    created_at: datetime


class AggregateLimeFactor(BaseModel):
    rule: str
    weight: float
    impact: str | None = None


class AggregateShapValue(BaseModel):
    feature: str
    shap_value: float
    impact: str | None = None
    value: float | None = None


class AggregateExplanationRequest(BaseModel):
    lesson_id: str
    prediction_id: int
    student_id: str
    predicted_cognitive_load: str
    predicted_score: int
    confidence: float
    lime_factors: list[AggregateLimeFactor]
    shap_values: list[AggregateShapValue]
    lime_explanation: dict[str, Any] | None = None
    shap_explanation: dict[str, Any] | None = None


class TeacherGuidanceDecision(BaseModel):
    reason: str = Field(default="", max_length=500)


class TechniqueFeedbackRequest(BaseModel):
    technique: str = Field(min_length=1, max_length=100)
    used: bool
    helpfulness: int | None = Field(default=None, ge=1, le=5)
    ease_of_use: int | None = Field(default=None, ge=1, le=5)
    comment: str = Field(default="", max_length=1000)
