from datetime import datetime

from pydantic import BaseModel


class RawPredictionInput(BaseModel):
    student_id: str
    lesson_id: str
    session_id: str
    minute_index: int = 1
    window_start: datetime
    window_end: datetime
