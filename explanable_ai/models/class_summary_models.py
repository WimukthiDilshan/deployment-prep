from typing import Literal

from pydantic import BaseModel, Field

CognitiveLoadLabel = Literal["Very Low", "Low", "Medium", "High", "Very High"]


class CognitiveLoadCounts(BaseModel):
    very_low: int = Field(default=0, alias="Very Low")
    low: int = Field(default=0, alias="Low")
    medium: int = Field(default=0, alias="Medium")
    high: int = Field(default=0, alias="High")
    very_high: int = Field(default=0, alias="Very High")

    class Config:
        populate_by_name = True


class CommonFactor(BaseModel):
    feature: str
    frequency: int


class ClassSummary(BaseModel):
    lesson_id: int
    total_students: int
    cognitive_load_counts: CognitiveLoadCounts
    dominant_cognitive_load: CognitiveLoadLabel | None = None
    common_factors: list[CommonFactor]
    cognitive_load_distribution: list[int]
    next_lesson_recommendation: str | None = None


class ClassRecommendationRequest(BaseModel):
    class_summary: ClassSummary


class ClassRecommendationResponse(BaseModel):
    lesson_id: int
    next_lesson_recommendation: str
    saved_row_id: int | None = None
