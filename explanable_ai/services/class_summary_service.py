from __future__ import annotations

import json
from collections import Counter
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.class_summary_models import ClassSummary, CommonFactor, CognitiveLoadCounts
from repositories.explainability_repository import (
    get_latest_class_lesson_summary_by_lesson_id,
    get_student_lesson_explanations_by_lesson_id,
)

COGNITIVE_LOAD_ORDER = ["Very Low", "Low", "Medium", "High", "Very High"]
COGNITIVE_LOAD_TO_NUMBER = {
    "Very Low": 1,
    "Low": 2,
    "Medium": 3,
    "High": 4,
    "Very High": 5,
}
FACTOR_FIELDS = [
    "shap_top_factors_json",
    "lime_top_factors_json",
    "agreed_top_factors_json",
]


def _to_int(value: Any) -> int | None:
    """Safely convert a database value to int when possible."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return int(stripped)
        except ValueError:
            return None
    return None


def _parse_json_payload(value: Any) -> list[dict[str, Any]]:
    """Parse a JSON text column into a list of factor dictionaries."""
    if value is None:
        return []
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
    return []


def _extract_label(row: dict[str, Any]) -> str | None:
    """Read the saved final cognitive load label from one explanation row."""
    value = row.get("final_cognitive_load")
    if isinstance(value, str):
        normalized = value.strip()
        if normalized in COGNITIVE_LOAD_ORDER:
            return normalized
    return None


def _dominant_label(counts: dict[str, int]) -> str | None:
    """Pick the most common cognitive load level for the lesson."""
    max_count = max(counts.values()) if counts else 0
    if max_count <= 0:
        return None
    for label in COGNITIVE_LOAD_ORDER:
        if counts.get(label, 0) == max_count:
            return label
    return None


def _count_cognitive_loads(rows: list[dict[str, Any]]) -> dict[str, int]:
    """Count saved cognitive load labels across student explanations."""
    counts = {label: 0 for label in COGNITIVE_LOAD_ORDER}
    for row in rows:
        label = _extract_label(row)
        if label is not None:
            counts[label] += 1
    return counts


def _build_cognitive_load_distribution(rows: list[dict[str, Any]]) -> list[int]:
    """Map saved labels to numeric values for charting and box plots."""
    distribution: list[int] = []
    for row in rows:
        label = _extract_label(row)
        if label is not None:
            distribution.append(COGNITIVE_LOAD_TO_NUMBER[label])
    return distribution


def _aggregate_common_factors(rows: list[dict[str, Any]]) -> list[CommonFactor]:
    """Collect the most repeated explanation factor names across students."""
    factor_counts: Counter[str] = Counter()

    for row in rows:
        per_student_features: set[str] = set()
        for field_name in FACTOR_FIELDS:
            for factor in _parse_json_payload(row.get(field_name)):
                feature = factor.get("feature")
                if isinstance(feature, str) and feature.strip():
                    per_student_features.add(feature.strip())
        factor_counts.update(per_student_features)

    ranked = sorted(factor_counts.items(), key=lambda item: (-item[1], item[0]))
    return [CommonFactor(feature=feature, frequency=frequency) for feature, frequency in ranked[:5]]


def generate_class_summary(
    db: Session,
    lesson_id: int,
) -> ClassSummary:
    """Build the class summary object for a lesson from saved explanations."""
    rows = get_student_lesson_explanations_by_lesson_id(db, lesson_id)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "message": "No saved student explanations found for the requested lesson.",
                "data": None,
                "errors": [f"lesson_id={lesson_id} not found"],
            },
        )
    counts = _count_cognitive_loads(rows)
    latest_summary_row = get_latest_class_lesson_summary_by_lesson_id(db, lesson_id)
    return ClassSummary(
        lesson_id=lesson_id,
        total_students=len(rows),
        cognitive_load_counts=CognitiveLoadCounts.model_validate(counts),
        dominant_cognitive_load=_dominant_label(counts),
        common_factors=_aggregate_common_factors(rows),
        cognitive_load_distribution=_build_cognitive_load_distribution(rows),
        next_lesson_recommendation=(
            latest_summary_row.get("next_lesson_recommendation")
            if latest_summary_row
            else None
        ),
    )
