from typing import Any

from sqlalchemy.orm import Session

from repositories.explainability_repository import (
    get_cognitive_load_logs_by_student_and_lesson,
)

AVERAGE_FIELDS = [
    "pause_frequency",
    "navigation_count_video",
    "rewatch_segments",
    "playback_rate_change",
    "idle_duration_video",
    "time_on_content",
    "navigation_count_adaptation",
    "revisit_frequency",
    "idle_duration_adaptation",
    "quiz_response_time",
    "error_rate",
]

COGNITIVE_LOAD_LABELS = ["Very Low", "Low", "Medium", "High", "Very High"]
COGNITIVE_LABEL_KEYS = [
    "cognitive_load_label",
    "cognitive_load",
    "load_label",
    "label",
]


def _to_float(value: Any) -> float | None:
    """Convert an input value to float when possible."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return float(stripped)
        except ValueError:
            return None
    return None


def _average_for_field(rows: list[dict[str, Any]], field_name: str) -> float | None:
    """Compute the average for one numeric field across log rows."""
    values: list[float] = []
    for row in rows:
        numeric_value = _to_float(row.get(field_name))
        if numeric_value is not None:
            values.append(numeric_value)

    if not values:
        return None

    return sum(values) / len(values)


def _extract_cognitive_load_label(row: dict[str, Any]) -> str | None:
    """Extract the predicted label from a log row if one exists."""
    for key in COGNITIVE_LABEL_KEYS:
        value = row.get(key)
        if isinstance(value, str):
            normalized = value.strip()
            if normalized in COGNITIVE_LOAD_LABELS:
                return normalized
    return None


def _count_cognitive_load_labels(rows: list[dict[str, Any]]) -> dict[str, int]:
    """Count how many times each cognitive load label appears."""
    counts = {label: 0 for label in COGNITIVE_LOAD_LABELS}

    for row in rows:
        label = _extract_cognitive_load_label(row)
        if label is not None:
            counts[label] += 1

    return counts


def _dominant_label(counts: dict[str, int]) -> str | None:
    """Return the most frequent label using a stable tie-break order."""
    max_count = max(counts.values()) if counts else 0
    if max_count <= 0:
        return None

    # Keep a stable tie-break order based on requested label ranking.
    for label in COGNITIVE_LOAD_LABELS:
        if counts[label] == max_count:
            return label

    return None


def generate_student_summary(
    db: Session,
    student_id: int,
    lesson_id: int,
) -> dict[str, Any]:
    """Build a student-level summary object from raw cognitive load logs."""
    rows = get_cognitive_load_logs_by_student_and_lesson(db, student_id, lesson_id)

    averages = {
        f"avg_{field}": _average_for_field(rows, field)
        for field in AVERAGE_FIELDS
    }

    counts = _count_cognitive_load_labels(rows)
    final_cognitive_load = _dominant_label(counts)

    return {
        "summary": {
            "averages": averages,
            "counts": counts,
        },
        "final_cognitive_load": final_cognitive_load,
    }
