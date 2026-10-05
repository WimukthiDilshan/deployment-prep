from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from models.class_summary_models import ClassSummary, ClassRecommendationResponse
from repositories.explainability_repository import save_class_lesson_summary
from services.gpt_client import generate_gpt_text, has_gpt_api_key


def _build_gpt_recommendation(class_summary: ClassSummary) -> str:
    """Build the GPT prompt for class-level recommendation generation."""
    dominant = class_summary.dominant_cognitive_load or "unknown"
    common_features = ", ".join(item.feature for item in class_summary.common_factors[:3]) or "limited signals"
    counts = class_summary.cognitive_load_counts.model_dump(by_alias=True)

    system_prompt = (
        "You are an expert teaching strategist. You receive class-level cognitive load summaries "
        "and produce practical recommendations for the next lesson."
    )
    user_prompt = (
        f"Lesson ID: {class_summary.lesson_id}\n"
        f"Total students: {class_summary.total_students}\n"
        f"Dominant cognitive load: {dominant}\n"
        f"Load counts: {counts}\n"
        f"Common factors: {common_features}\n\n"
        "Write one concise recommendation paragraph for the next lesson plan."
    )

    # Real GPT recommendation generation is integrated here.
    return generate_gpt_text(system_prompt, user_prompt, temperature=0.2)


def _build_deterministic_recommendation(class_summary: ClassSummary) -> str:
    """Return a rule-based recommendation when GPT is unavailable."""
    dominant = class_summary.dominant_cognitive_load or "Medium"
    if dominant in {"High", "Very High"}:
        base_text = "Reduce complexity in the next lesson, add shorter sections, and include more guided practice."
    elif dominant == "Medium":
        base_text = "Keep the next lesson balanced and add small comprehension checks."
    else:
        base_text = "Advance gradually and keep the next lesson concise while reinforcing key ideas."

    common_features = ", ".join(item.feature for item in class_summary.common_factors[:3])
    if common_features:
        return f"{base_text} Common signals to address: {common_features}."
    return base_text


def _build_next_lesson_recommendation(class_summary: ClassSummary) -> str:
    """Prefer GPT output, then safely fall back to deterministic text."""
    if has_gpt_api_key():
        try:
            text = _build_gpt_recommendation(class_summary)
            if text:
                return text
        except Exception:
            pass
    return _build_deterministic_recommendation(class_summary)


def _serialize_summary(class_summary: ClassSummary) -> dict[str, Any]:
    """Serialize the summary model for persistence/debugging."""
    return class_summary.model_dump(by_alias=True)


def _build_save_payload(
    class_summary: ClassSummary,
    next_lesson_recommendation: str,
) -> dict[str, Any]:
    """Map the recommendation payload to the existing class summary columns."""
    counts = class_summary.cognitive_load_counts.model_dump(by_alias=True)
    payload: dict[str, Any] = {
        "lesson_id": class_summary.lesson_id,
        "very_low_student_count": counts.get("Very Low", 0),
        "low_student_count": counts.get("Low", 0),
        "medium_student_count": counts.get("Medium", 0),
        "high_student_count": counts.get("High", 0),
        "very_high_student_count": counts.get("Very High", 0),
        "dominant_cognitive_load": class_summary.dominant_cognitive_load,
        "common_factors_json": json.dumps([item.model_dump() for item in class_summary.common_factors], ensure_ascii=False),
        "next_lesson_recommendation": next_lesson_recommendation,
    }
    # Persist using the existing class_lesson_summary schema without changing column names.
    return payload


def generate_class_recommendation(
    db: Session,
    class_summary: ClassSummary,
) -> ClassRecommendationResponse:
    """Generate and persist the lesson-level recommendation result."""
    recommendation = _build_next_lesson_recommendation(class_summary)
    saved_row_id = save_class_lesson_summary(
        db,
        _build_save_payload(class_summary, recommendation),
    )
    return ClassRecommendationResponse(
        lesson_id=class_summary.lesson_id,
        next_lesson_recommendation=recommendation,
        saved_row_id=saved_row_id,
    )
