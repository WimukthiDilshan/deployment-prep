from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from models.explanation_models import GenerateStudentExplanationsResponse
from repositories.explainability_repository import get_students_by_lesson_id
from services.student_explanation_service import generate_student_explanation_record


def _to_int(value: Any) -> int | None:
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


def _extract_unique_student_ids(rows: list[dict[str, Any]]) -> list[int]:
    student_ids: set[int] = set()
    for row in rows:
        student_id = _to_int(row.get("student_id"))
        if student_id is not None:
            student_ids.add(student_id)
    return sorted(student_ids)


def generate_student_explanations_for_lesson(
    db: Session,
    lesson_id: int,
) -> GenerateStudentExplanationsResponse:
    rows = get_students_by_lesson_id(db, lesson_id)
    student_ids = _extract_unique_student_ids(rows)

    items = [
        generate_student_explanation_record(db, student_id, lesson_id)
        for student_id in student_ids
    ]

    return GenerateStudentExplanationsResponse(
        lesson_id=lesson_id,
        count=len(items),
        items=items,
    )
