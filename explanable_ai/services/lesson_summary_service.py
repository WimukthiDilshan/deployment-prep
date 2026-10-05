from typing import Any

from sqlalchemy.orm import Session

from repositories.explainability_repository import get_students_by_lesson_id
from services.student_summary_service import generate_student_summary


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
        parsed_student_id = _to_int(row.get("student_id"))
        if parsed_student_id is not None:
            student_ids.add(parsed_student_id)

    return sorted(student_ids)


def generate_lesson_student_summaries(
    db: Session,
    lesson_id: int,
) -> list[dict[str, Any]]:
    lesson_rows = get_students_by_lesson_id(db, lesson_id)
    student_ids = _extract_unique_student_ids(lesson_rows)

    summaries: list[dict[str, Any]] = []
    for student_id in student_ids:
        student_summary = generate_student_summary(db, student_id, lesson_id)
        summaries.append(
            {
                "student_id": student_id,
                "summary": student_summary["summary"],
                "final_cognitive_load": student_summary["final_cognitive_load"],
            }
        )

    return summaries
