from pydantic import BaseModel


class LoadTimelineItem(BaseModel):
    minute_index: int
    predicted_load: str
    predicted_score: int


class CognitiveLoadTrendAnalysisResponse(BaseModel):
    student_id: str
    lesson_id: str
    session_id: str | None = None
    current_load: str
    current_score: int
    trend: str
    risk_level: str
    timeline: list[LoadTimelineItem]
