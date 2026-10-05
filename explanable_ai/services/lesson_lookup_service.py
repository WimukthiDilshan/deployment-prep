from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.api_response_models import LessonOverviewItem, LessonStudentsData, StudentItem
from repositories.explainability_repository import get_lesson_overviews, get_unique_students_by_lesson_id


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


def _not_found(message: str, lesson_id: int | None = None) -> HTTPException:
    errors = []
    if lesson_id is not None:
        errors.append(f"lesson_id={lesson_id} not found")
    return HTTPException(
        status_code=404,
        detail={
            "success": False,
            "message": message,
            "data": None,
            "errors": errors,
        },
    )


def list_lessons(db: Session) -> list[LessonOverviewItem]:
    rows = get_lesson_overviews(db)
    return [
        LessonOverviewItem(
            lesson_id=_to_int(row.get("lesson_id")) or 0,
            total_students=_to_int(row.get("total_students")) or 0,
        )
        for row in rows
    ]


def list_students_for_lesson(db: Session, lesson_id: int) -> LessonStudentsData:
    rows = get_unique_students_by_lesson_id(db, lesson_id)
    if not rows:
        raise _not_found("No students found for the requested lesson.", lesson_id)

    students = [
        StudentItem(student_id=_to_int(row.get("student_id")) or 0)
        for row in rows
        if _to_int(row.get("student_id")) is not None
    ]

    if not students:
        raise _not_found("No students found for the requested lesson.", lesson_id)

    return LessonStudentsData(
        lesson_id=lesson_id,
        total_students=len(students),
        students=students,
    )
