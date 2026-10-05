from app.schemas.trend_analysis import (
    CognitiveLoadTrendAnalysisResponse,
    LoadTimelineItem,
)
from app.services.db_service import get_student_lesson_prediction_windows


LOAD_LABEL_TO_SCORE = {
    "very low": 1,
    "low": 2,
    "medium": 3,
    "high": 4,
    "very high": 5,
}

SCORE_TO_LOAD_LABEL = {
    1: "Very Low",
    2: "Low",
    3: "Medium",
    4: "High",
    5: "Very High",
}

def analyze_cognitive_load_trend(
    student_id: str,
    lesson_id: str,
    session_id: str | None = None,
    limit: int = 12,
) -> CognitiveLoadTrendAnalysisResponse:
    # Use a bounded recent history so the trend reflects the current lesson moment.
    rows = get_student_lesson_prediction_windows(
        student_id=student_id,
        lesson_id=lesson_id,
        session_id=session_id,
        limit=max(3, min(limit, 30)),
    )
    scored_rows = [_normalize_row(row) for row in rows if _row_has_prediction(row)]

    if not scored_rows:
        return CognitiveLoadTrendAnalysisResponse(
            student_id=student_id,
            lesson_id=lesson_id,
            session_id=session_id,
            current_load="Unknown",
            current_score=0,
            trend="insufficient_data",
            risk_level="unknown",
            timeline=[],
        )

    current = scored_rows[-1]
    scores = [row["predicted_score"] for row in scored_rows]
    trend = _detect_trend(scores)
    risk_level = _detect_risk_level(current["predicted_score"], trend, scores)

    return CognitiveLoadTrendAnalysisResponse(
        student_id=student_id,
        lesson_id=lesson_id,
        session_id=current.get("session_id") or session_id,
        current_load=current["predicted_load"],
        current_score=current["predicted_score"],
        trend=trend,
        risk_level=risk_level,
        timeline=[
            LoadTimelineItem(
                minute_index=row["minute_index"],
                predicted_load=row["predicted_load"],
                predicted_score=row["predicted_score"],
            )
            for row in scored_rows
        ],
    )


def _row_has_prediction(row: dict) -> bool:
    return row.get("predicted_score") is not None or row.get("predicted_cognitive_load") is not None


def _normalize_row(row: dict) -> dict:
    predicted_score = _safe_int(row.get("predicted_score"))
    predicted_load = row.get("predicted_cognitive_load")

    if predicted_score <= 0 and isinstance(predicted_load, str):
        predicted_score = LOAD_LABEL_TO_SCORE.get(predicted_load.strip().lower(), 0)

    if not isinstance(predicted_load, str) or not predicted_load.strip():
        predicted_load = SCORE_TO_LOAD_LABEL.get(predicted_score, "Unknown")

    normalized = dict(row)
    normalized["predicted_score"] = predicted_score
    normalized["predicted_load"] = predicted_load
    normalized["minute_index"] = _safe_int(row.get("minute_index"))
    return normalized


def _detect_trend(scores: list[int]) -> str:
    # The latest few windows matter most for deciding whether load is rising or settling.
    recent_scores = [score for score in scores[-4:] if score > 0]

    if len(recent_scores) < 2:
        return "insufficient_data"

    differences = [
        recent_scores[index] - recent_scores[index - 1]
        for index in range(1, len(recent_scores))
    ]

    if all(difference > 0 for difference in differences):
        return "rising"
    if all(difference < 0 for difference in differences):
        return "decreasing"
    if all(difference == 0 for difference in differences):
        return "stable"

    net_change = recent_scores[-1] - recent_scores[0]
    if net_change >= 2:
        return "rising"
    if net_change <= -2:
        return "decreasing"
    return "fluctuating"


def _detect_risk_level(current_score: int, trend: str, scores: list[int]) -> str:
    # Risk combines the current load with whether high load is continuing.
    high_load_streak = _count_high_load_streak(scores)

    if current_score >= 5:
        return "high"
    if current_score >= 4 and trend == "rising":
        return "high"
    if current_score >= 4 and trend == "stable":
        return "high" if high_load_streak >= 2 else "moderate"
    if current_score >= 3 and trend == "rising":
        return "moderate"
    if high_load_streak >= 2:
        return "moderate"
    if current_score in {1, 2} and trend != "rising":
        return "low"
    return "moderate"


def _count_high_load_streak(scores: list[int]) -> int:
    streak = 0
    for score in reversed(scores):
        if score >= 4:
            streak += 1
        else:
            break
    return streak


def _safe_int(value) -> int:
    if value in (None, ""):
        return 0

    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0
