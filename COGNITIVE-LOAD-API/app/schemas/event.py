from datetime import datetime
from typing import Literal

from pydantic import BaseModel


RawInteractionEventType = Literal[
    "play",
    "pause",
    "seek_forward",
    "seek_backward",
    "rate_change",
    "adaptation_navigation",
    "adaptation_revisit",
    "adaptation_idle",
    "idle_start",
    "idle_end",
    "quiz_submit",
]

ALLOWED_RAW_EVENT_TYPES = list(RawInteractionEventType.__args__)


class RawInteractionEventInput(BaseModel):
    student_id: str
    lesson_id: str
    session_id: str | None = None
    event_type: RawInteractionEventType
    event_time: datetime
    video_time: float | None = None
    from_position: float | None = None
    to_position: float | None = None
    event_value: str | None = None
    question_id: str | None = None
    is_correct: bool | None = None
