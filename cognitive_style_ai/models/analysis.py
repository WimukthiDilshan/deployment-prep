from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from config.database import Base


class CognitiveStyleAnalysis(Base):
    __tablename__ = "cognitive-style-analysis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lesson_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    student_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    source_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    analysis_status: Mapped[str] = mapped_column(
        Enum("pending", "completed", name="cognitive_style_analysis_status"),
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
    )
    cognitive_style: Mapped[str | None] = mapped_column(String(50), nullable=True)
    model_signature: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    feature_values: Mapped[dict] = mapped_column(JSON, nullable=False)
    lime_output: Mapped[list | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    shap_output: Mapped[list | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    top_features: Mapped[list | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    explanation_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    human_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
