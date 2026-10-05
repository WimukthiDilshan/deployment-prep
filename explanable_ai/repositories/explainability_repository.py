from collections.abc import Mapping
from typing import Any

from sqlalchemy.orm import Session

from repositories.query_utils import fetch_all, insert_record

COGNITIVE_LOAD_LOGS_TABLE = "cognitive_load_logs"
STUDENT_LESSON_EXPLANATIONS_TABLE = "student_lesson_explanations"
CLASS_LESSON_SUMMARY_TABLE = "class_lesson_summary"


def get_cognitive_load_logs_by_student_and_lesson(
    db: Session,
    student_id: int,
    lesson_id: int,
) -> list[dict[str, Any]]:
    """Fetch raw cognitive load rows for one student in one lesson."""
    query = (
        "SELECT * FROM cognitive_load_logs "
        "WHERE student_id = :student_id AND lesson_id = :lesson_id"
    )
    return fetch_all(
        db,
        query,
        {"student_id": student_id, "lesson_id": lesson_id},
    )


def get_students_by_lesson_id(
    db: Session,
    lesson_id: int,
) -> list[dict[str, Any]]:
    """Fetch all raw log rows for a lesson."""
    query = "SELECT * FROM cognitive_load_logs WHERE lesson_id = :lesson_id"
    return fetch_all(db, query, {"lesson_id": lesson_id})


def get_lesson_overviews(
    db: Session,
) -> list[dict[str, Any]]:
    """Return lesson ids and student counts for the lesson selector."""
    query = (
        "SELECT lesson_id, COUNT(DISTINCT student_id) AS total_students "
        "FROM cognitive_load_logs "
        "GROUP BY lesson_id "
        "ORDER BY lesson_id"
    )
    return fetch_all(db, query)


def get_unique_students_by_lesson_id(
    db: Session,
    lesson_id: int,
) -> list[dict[str, Any]]:
    """Return unique student ids for a lesson."""
    query = (
        "SELECT DISTINCT student_id FROM cognitive_load_logs "
        "WHERE lesson_id = :lesson_id "
        "ORDER BY student_id"
    )
    return fetch_all(db, query, {"lesson_id": lesson_id})


def get_student_lesson_explanations_by_lesson_id(
    db: Session,
    lesson_id: int,
) -> list[dict[str, Any]]:
    """Read saved student explanation rows for a lesson."""
    query = "SELECT * FROM student_lesson_explanations WHERE lesson_id = :lesson_id"
    return fetch_all(db, query, {"lesson_id": lesson_id})


def get_latest_student_lesson_explanation_by_student_and_lesson(
    db: Session,
    student_id: int,
    lesson_id: int,
) -> dict[str, Any] | None:
    """Return the latest saved student explanation row for one student and lesson."""
    query = (
        "SELECT * FROM student_lesson_explanations "
        "WHERE student_id = :student_id AND lesson_id = :lesson_id "
        "ORDER BY id DESC LIMIT 1"
    )
    rows = fetch_all(db, query, {"student_id": student_id, "lesson_id": lesson_id})
    return rows[0] if rows else None


def get_latest_class_lesson_summary_by_lesson_id(
    db: Session,
    lesson_id: int,
) -> dict[str, Any] | None:
    """Return the latest saved class summary row for a lesson."""
    query = (
        "SELECT * FROM class_lesson_summary "
        "WHERE lesson_id = :lesson_id "
        "ORDER BY id DESC LIMIT 1"
    )
    rows = fetch_all(db, query, {"lesson_id": lesson_id})
    return rows[0] if rows else None


def save_student_lesson_explanation(
    db: Session,
    payload: Mapping[str, Any],
) -> int | None:
    """Persist a generated student explanation row."""
    return insert_record(db, STUDENT_LESSON_EXPLANATIONS_TABLE, payload)


def save_class_lesson_summary(
    db: Session,
    payload: Mapping[str, Any],
) -> int | None:
    """Persist a generated class summary or recommendation row."""
    return insert_record(db, CLASS_LESSON_SUMMARY_TABLE, payload)
