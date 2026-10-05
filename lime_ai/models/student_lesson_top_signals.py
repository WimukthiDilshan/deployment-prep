from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from config.database import Base


class StudentLessonTopSignals(Base):
    __tablename__ = "student-lesson-top-signals"
    __table_args__ = (
        UniqueConstraint("student_id", "lesson_id", name="uq_top_signals_student_lesson"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    lesson_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    prediction_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    predicted_cognitive_load: Mapped[str] = mapped_column(String(20), nullable=False)
    predicted_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    top_1_signal: Mapped[str | None] = mapped_column(String(255), nullable=True)
    top_1_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    top_1_normalized_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    top_2_signal: Mapped[str | None] = mapped_column(String(255), nullable=True)
    top_2_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    top_2_normalized_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    top_3_signal: Mapped[str | None] = mapped_column(String(255), nullable=True)
    top_3_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    top_3_normalized_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Keep the complete analysis beside the ranked values.  This record is
    # unique per student and lesson, so a later request can be served without
    # rerunning LIME, SHAP, or Gemini.
    lime_explanation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    shap_explanation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    human_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation_source: Mapped[str | None] = mapped_column(String(30), nullable=True)
    study_technique: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    lecture_support: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    shared_to_student: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    shared_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
