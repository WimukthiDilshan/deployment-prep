import re
from collections.abc import Mapping
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

_IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _validate_identifier(identifier: str) -> str:
    """Reject unsafe SQL identifiers before building raw insert statements."""
    if not _IDENTIFIER_PATTERN.match(identifier):
        raise ValueError(f"Invalid SQL identifier: {identifier}")
    return identifier


def fetch_all(
    db: Session,
    query: str,
    params: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Run a SELECT query and return rows as dictionaries."""
    result = db.execute(text(query), params or {})
    return [dict(row._mapping) for row in result]


def insert_record(db: Session, table_name: str, payload: Mapping[str, Any]) -> int | None:
    """Insert a row into a known table and return the inserted row id."""
    if not payload:
        raise ValueError("Payload cannot be empty.")

    validated_table = _validate_identifier(table_name)
    columns = []
    placeholders = []

    for column in payload:
        validated_column = _validate_identifier(column)
        columns.append(validated_column)
        placeholders.append(f":{validated_column}")

    query = (
        f"INSERT INTO {validated_table} ({', '.join(columns)}) "
        f"VALUES ({', '.join(placeholders)})"
    )

    try:
        result = db.execute(text(query), dict(payload))
        db.commit()
    except Exception:
        db.rollback()
        raise

    return result.lastrowid
