from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from config.database import Base


class CognitiveLoadPrediction(Base):
    __tablename__ = "cognitive-load"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    lesson_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    minute_index: Mapped[int] = mapped_column(Integer, nullable=False)
    window_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    window_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    pause_frequency: Mapped[int] = mapped_column(Integer, nullable=False)
    navigation_count_video: Mapped[int] = mapped_column(Integer, nullable=False)
    rewatch_segments: Mapped[int] = mapped_column(Integer, nullable=False)
    playback_rate_change: Mapped[int] = mapped_column(Integer, nullable=False)
    idle_duration_video: Mapped[int] = mapped_column(Integer, nullable=False)
    time_on_content: Mapped[int] = mapped_column(Integer, nullable=False)
    navigation_count_adaptation: Mapped[int] = mapped_column(Integer, nullable=False)
    revisit_frequency: Mapped[int] = mapped_column(Integer, nullable=False)
    idle_duration_adaptation: Mapped[int] = mapped_column(Integer, nullable=False)
    quiz_response_time: Mapped[int] = mapped_column(Integer, nullable=False)
    error_rate: Mapped[float] = mapped_column(Float, nullable=False)
    predicted_cognitive_load: Mapped[str] = mapped_column(String(20), nullable=False)
    predicted_score: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
