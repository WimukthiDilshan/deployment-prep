from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
