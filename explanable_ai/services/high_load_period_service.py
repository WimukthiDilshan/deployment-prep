from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.api_response_models import HighLoadPeriodItem, HighLoadPeriodListData, PeriodExplanationData
from models.explanation_models import ExplainRequest, StudentSummaryInput, SummaryAverages, SummaryCounts
from repositories.explainability_repository import (
    get_cognitive_load_logs_by_student_and_lesson,
    get_students_by_lesson_id,
)
from services.explanation_service import build_explanation

RAW_FEATURE_FIELDS = [
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

TIMESTAMP_KEYS = [
    "created_at",
    "timestamp",
    "event_time",
    "recorded_at",
    "logged_at",
    "time",
]

LABEL_KEYS = [
    "final_cognitive_load",
    "predicted_cognitive_load",
    "predicted_label",
    "cognitive_load_label",
    "cognitive_load",
    "load_label",
    "label",
]
SCORE_KEYS = ["score", "predicted_score", "cognitive_load_score", "label_score"]
SCORE_TO_LABEL = {
    1: "Very Low",
    2: "Low",
    3: "Medium",
    4: "High",
    5: "Very High",
}

HIGH_LABELS = {"High", "Very High"}
PERIOD_GAP_SECONDS = 300

LABEL_NORMALIZATION = {
    "very low": "Very Low",
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "very high": "Very High",
}


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _parse_timestamp(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value))
        except (OverflowError, ValueError):
            return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _extract_row_timestamp(row: dict[str, Any]) -> datetime | None:
    for key in TIMESTAMP_KEYS:
        ts = _parse_timestamp(row.get(key))
        if ts is not None:
            return ts
    return None


def _label_from_row(row: dict[str, Any]) -> str | None:
    for key in LABEL_KEYS:
        value = row.get(key)
        if isinstance(value, str):
            normalized = value.strip()
            canonical = LABEL_NORMALIZATION.get(normalized.lower())
            if canonical is not None:
                return canonical
            # Some pipelines store score as text in label columns (e.g., "4" or "4.0").
            try:
                numeric_label = int(float(normalized))
            except ValueError:
                numeric_label = None
            if numeric_label in SCORE_TO_LABEL:
                return SCORE_TO_LABEL[numeric_label]
        elif value is not None:
            # Handle numeric DB types (e.g., Decimal) without importing DB-specific classes.
            try:
                numeric_label = int(float(value))
            except (TypeError, ValueError):
                numeric_label = None
            if numeric_label in SCORE_TO_LABEL:
                return SCORE_TO_LABEL[numeric_label]
    for key in SCORE_KEYS:
        raw_score = row.get(key)
        if raw_score is None:
            continue
        try:
            score = int(float(raw_score))
        except (TypeError, ValueError):
            continue
        if score in SCORE_TO_LABEL:
            return SCORE_TO_LABEL[score]
    return None


def _label_score(label: str | None) -> int:
    if label is None:
        return 0
    reverse = {value: key for key, value in SCORE_TO_LABEL.items()}
    return reverse.get(label, 0)


def _format_timestamp(ts: datetime | None) -> str | None:
    return ts.isoformat() if ts else None


def _dominant_label(labels: list[str]) -> str:
    if not labels:
        return "High"
    counts = Counter(labels)
    if counts.get("Very High", 0) >= counts.get("High", 0):
        return "Very High"
    return "High"


def _split_high_load_periods(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    annotated: list[tuple[dict[str, Any], datetime | None, str | None]] = []
    for row in rows:
        label = _label_from_row(row)
        if label in HIGH_LABELS:
            annotated.append((row, _extract_row_timestamp(row), label))

    if not annotated:
        return []

    annotated.sort(key=lambda item: item[1] or datetime.min)
    periods: list[dict[str, Any]] = []
    current_rows: list[dict[str, Any]] = []
    current_labels: list[str] = []
    start_ts: datetime | None = None
    prev_ts: datetime | None = None
    prev_label: str | None = None

    for row, ts, label in annotated:
        start_new = False
        if not current_rows:
            start_new = True
        elif prev_label is not None and label is not None and label != prev_label:
            # Keep High and Very High runs separate so transitions are visible as distinct periods.
            start_new = True
        elif ts is None or prev_ts is None:
            start_new = True
        else:
            delta = (ts - prev_ts).total_seconds()
            start_new = delta > PERIOD_GAP_SECONDS

        if start_new and current_rows:
            periods.append(
                {
                    "rows": current_rows,
                    "start_time": start_ts,
                    "end_time": prev_ts,
                    "row_count": len(current_rows),
                    "dominant_cognitive_load": _dominant_label(current_labels),
                }
            )
            current_rows = []
            current_labels = []
            start_ts = None

        if not current_rows:
            start_ts = ts

        current_rows.append(row)
        if label:
            current_labels.append(label)
        prev_ts = ts
        prev_label = label

    if current_rows:
        periods.append(
            {
                "rows": current_rows,
                "start_time": start_ts,
                "end_time": prev_ts,
                "row_count": len(current_rows),
                "dominant_cognitive_load": _dominant_label(current_labels),
            }
        )

    for index, period in enumerate(periods, start=1):
        period["period_id"] = index

    return periods


def list_high_load_periods(db: Session, student_id: int, lesson_id: int) -> HighLoadPeriodListData:
    rows = get_cognitive_load_logs_by_student_and_lesson(db, student_id, lesson_id)
    periods = _split_high_load_periods(rows)

    items = [
        HighLoadPeriodItem(
            period_id=period["period_id"],
            start_time=_format_timestamp(period["start_time"]),
            end_time=_format_timestamp(period["end_time"]),
            row_count=period["row_count"],
            dominant_cognitive_load=period["dominant_cognitive_load"],
        )
        for period in periods
    ]

    return HighLoadPeriodListData(
        student_id=student_id,
        lesson_id=lesson_id,
        periods=items,
    )


def _summary_from_period_row(row: dict[str, Any], label: str) -> ExplainRequest:
    averages_payload = {f"avg_{field}": _to_float(row.get(field)) for field in RAW_FEATURE_FIELDS}
    counts_payload = {"Very Low": 0, "Low": 0, "Medium": 0, "High": 0, "Very High": 0}
    counts_payload[label] = 1

    return ExplainRequest(
        summary=StudentSummaryInput(
            averages=SummaryAverages.model_validate(averages_payload),
            counts=SummaryCounts.model_validate(counts_payload),
        ),
        final_cognitive_load=label,
    )


def explain_high_load_period(
    db: Session,
    student_id: int,
    lesson_id: int,
    period_id: int,
) -> PeriodExplanationData:
    rows = get_cognitive_load_logs_by_student_and_lesson(db, student_id, lesson_id)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "message": "No cognitive load logs found for the requested student and lesson.",
                "data": None,
                "errors": [f"student_id={student_id}, lesson_id={lesson_id} not found"],
            },
        )

    periods = _split_high_load_periods(rows)
    target_period = next((period for period in periods if period["period_id"] == period_id), None)
    if target_period is None:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "message": "Requested high-load period was not found.",
                "data": None,
                "errors": [f"period_id={period_id} not found for student_id={student_id}, lesson_id={lesson_id}"],
            },
        )

    period_rows: list[dict[str, Any]] = target_period["rows"]
    dominant_label = target_period["dominant_cognitive_load"]

    # Pick the strongest row in the period (Very High preferred over High), then explain that row.
    target_row = max(period_rows, key=lambda row: _label_score(_label_from_row(row)))
    explain_request = _summary_from_period_row(target_row, dominant_label)

    background_rows = get_students_by_lesson_id(db, lesson_id)
    explanation = build_explanation(explain_request, background_rows=background_rows)

    return PeriodExplanationData(
        student_id=student_id,
        lesson_id=lesson_id,
        period_id=period_id,
        start_time=_format_timestamp(target_period["start_time"]),
        end_time=_format_timestamp(target_period["end_time"]),
        row_count=target_period["row_count"],
        summary=explain_request.summary,
        final_cognitive_load=dominant_label,
        shap_top_factors=explanation.shap_top_factors,
        lime_top_factors=explanation.lime_top_factors,
        agreed_top_factors=explanation.agreed_top_factors,
        explanation_text=explanation.explanation_text,
        recommendation_text=explanation.recommendation_text,
    )
