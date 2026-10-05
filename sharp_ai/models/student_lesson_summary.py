from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from config.database import Base


class StudentLessonSummary(Base):
    __tablename__ = "student-lesson-summary"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    lesson_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    minute_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    window_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    window_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    pause_frequency: Mapped[float] = mapped_column(Float, nullable=False)
    navigation_count_video: Mapped[float] = mapped_column(Float, nullable=False)
    rewatch_segments: Mapped[float] = mapped_column(Float, nullable=False)
    playback_rate_change: Mapped[float] = mapped_column(Float, nullable=False)
    idle_duration_video: Mapped[float] = mapped_column(Float, nullable=False)
    time_on_content: Mapped[float] = mapped_column(Float, nullable=False)
    navigation_count_adaptation: Mapped[float] = mapped_column(Float, nullable=False)
    revisit_frequency: Mapped[float] = mapped_column(Float, nullable=False)
    idle_duration_adaptation: Mapped[float] = mapped_column(Float, nullable=False)
    quiz_response_time: Mapped[float] = mapped_column(Float, nullable=False)
    error_rate: Mapped[float] = mapped_column(Float, nullable=False)
    predicted_cognitive_load: Mapped[str] = mapped_column(String(20), nullable=False)
    predicted_score: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    record_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
