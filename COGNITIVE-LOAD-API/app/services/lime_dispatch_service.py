import json
import os
from datetime import datetime, timedelta
from urllib import error, request

from app.services.db_service import (
    get_event_time_bounds,
    get_feature_window_by_bounds,
    get_latest_successful_dispatch_end,
    has_successful_feature_window_dispatch,
    save_feature_window,
    save_feature_window_dispatch,
)
from app.services.feature_extraction_service import extract_feature_window_from_raw


WINDOW_DURATION = timedelta(minutes=2)
LIME_TARGET_SERVICE = "lime_ai"

LIME_PAYLOAD_FIELDS = [
    "student_id",
    "lesson_id",
    "session_id",
    "minute_index",
    "window_start",
    "window_end",
    "pause_frequency",
    "navigation_count_video",
    "rewatch_segments",
    "playback_rate_change",
    "idle_duration_video",
    "time_on_content",
]


def process_completed_windows_for_event(event_data: dict) -> dict:
    session_id = event_data.get("session_id")
    if not session_id:
        return {
            "enabled": False,
            "reason": "session_id is required for automatic 2-minute window dispatch.",
            "processed_windows": [],
        }

    student_id = event_data["student_id"]
    lesson_id = event_data["lesson_id"]

    bounds = get_event_time_bounds(
        student_id=student_id,
        lesson_id=lesson_id,
        session_id=session_id,
    )
    if not bounds:
        return {
            "enabled": True,
            "reason": "No raw-event bounds found yet.",
            "processed_windows": [],
        }

    first_event_time = _normalize_datetime(bounds.get("first_event_time"))
    last_event_time = _normalize_datetime(bounds.get("last_event_time"))
    if first_event_time is None or last_event_time is None:
        return {
            "enabled": True,
            "reason": "Not enough events to compute time bounds.",
            "processed_windows": [],
        }

    next_window_start = get_latest_successful_dispatch_end(
        student_id=student_id,
        lesson_id=lesson_id,
        session_id=session_id,
        target_service=LIME_TARGET_SERVICE,
    )
    next_window_start = _normalize_datetime(next_window_start) or first_event_time

    processed_windows = []
    window_start = next_window_start

    # Only closed 2-minute windows are sent, so LIME gets complete behavior snapshots.
    while window_start + WINDOW_DURATION <= last_event_time:
        minute_index = int(((window_start - first_event_time).total_seconds() // WINDOW_DURATION.total_seconds()) + 1)
        window_end = window_start + WINDOW_DURATION
        processed_windows.append(
            _process_window(
                student_id=student_id,
                lesson_id=lesson_id,
                session_id=session_id,
                minute_index=minute_index,
                window_start=window_start,
                window_end=window_end,
            )
        )
        window_start = window_end

    return {
        "enabled": True,
        "reason": "Processed completed 2-minute windows.",
        "processed_windows": processed_windows,
    }


def _process_window(
    student_id: str,
    lesson_id: str,
    session_id: str,
    minute_index: int,
    window_start: datetime,
    window_end: datetime,
) -> dict:
    # Dispatch records make this safe to call repeatedly as new raw events arrive.
    if has_successful_feature_window_dispatch(
        student_id=student_id,
        lesson_id=lesson_id,
        session_id=session_id,
        window_start=window_start,
        window_end=window_end,
        target_service=LIME_TARGET_SERVICE,
    ):
        return {
            "minute_index": minute_index,
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
            "status": "skipped",
            "message": "Window already sent to LIME AI.",
        }

    feature_window_data = extract_feature_window_from_raw(
        {
            "student_id": student_id,
            "lesson_id": lesson_id,
            "session_id": session_id,
            "minute_index": minute_index,
            "window_start": window_start,
            "window_end": window_end,
        }
    )

    feature_window_id = _ensure_feature_window_saved(feature_window_data)

    try:
        lime_response = _post_feature_window_to_lime(feature_window_data)
        status = "success"
        message = str(lime_response.get("message") or "Sent to LIME AI.")
    except Exception as exc:
        lime_response = None
        status = "failed"
        message = str(exc)

    save_feature_window_dispatch(
        {
            "feature_window_id": feature_window_id,
            "student_id": student_id,
            "lesson_id": lesson_id,
            "session_id": session_id,
            "minute_index": minute_index,
            "window_start": window_start,
            "window_end": window_end,
            "target_service": LIME_TARGET_SERVICE,
            "status": status,
            "response_message": message[:1000],
        }
    )

    payload = {
        "minute_index": minute_index,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "status": status,
        "message": message,
    }
    if lime_response is not None:
        payload["lime_response"] = lime_response

    return payload


def dispatch_saved_feature_window_to_lime(feature_window_id, feature_window_data: dict) -> dict:
    session_id = feature_window_data.get("session_id")
    window_start = feature_window_data.get("window_start")
    window_end = feature_window_data.get("window_end")

    if not session_id or window_start is None or window_end is None:
        return {
            "enabled": False,
            "status": "skipped",
            "message": "session_id, window_start, and window_end are required for LIME dispatch.",
        }

    if has_successful_feature_window_dispatch(
        student_id=feature_window_data["student_id"],
        lesson_id=feature_window_data["lesson_id"],
        session_id=session_id,
        window_start=window_start,
        window_end=window_end,
        target_service=LIME_TARGET_SERVICE,
    ):
        return {
            "enabled": True,
            "status": "skipped",
            "message": "Window already sent to LIME AI.",
        }

    try:
        lime_response = _post_feature_window_to_lime(feature_window_data)
        status = "success"
        message = str(lime_response.get("message") or "Sent to LIME AI.")
    except Exception as exc:
        lime_response = None
        status = "failed"
        message = str(exc)

    save_feature_window_dispatch(
        {
            "feature_window_id": feature_window_id,
            "student_id": feature_window_data["student_id"],
            "lesson_id": feature_window_data["lesson_id"],
            "session_id": session_id,
            "minute_index": feature_window_data["minute_index"],
            "window_start": window_start,
            "window_end": window_end,
            "target_service": LIME_TARGET_SERVICE,
            "status": status,
            "response_message": message[:1000],
        }
    )

    payload = {
        "enabled": True,
        "minute_index": feature_window_data["minute_index"],
        "window_start": _serialize_value(window_start),
        "window_end": _serialize_value(window_end),
        "status": status,
        "message": message,
    }
    if lime_response is not None:
        payload["lime_response"] = lime_response

    return payload


def _ensure_feature_window_saved(feature_window_data: dict):
    existing_window = get_feature_window_by_bounds(
        student_id=feature_window_data["student_id"],
        lesson_id=feature_window_data["lesson_id"],
        session_id=feature_window_data["session_id"],
        window_start=feature_window_data["window_start"],
        window_end=feature_window_data["window_end"],
    )
    if existing_window:
        return existing_window["id"]
    return save_feature_window(
        {
            key: value
            for key, value in feature_window_data.items()
            if key != "raw_event_count"
        }
    )


def _post_feature_window_to_lime(feature_window_data: dict) -> dict:
    endpoint = os.getenv("LIME_PREDICT_URL", "http://127.0.0.1:8110/api/v1/predict").strip()
    # Send only the fields LIME AI needs for its explanation model.
    request_body = json.dumps(
        {
            key: _serialize_value(value)
            for key, value in feature_window_data.items()
            if key in LIME_PAYLOAD_FIELDS
        }
    ).encode("utf-8")

    http_request = request.Request(
        endpoint,
        data=request_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=15) as response:
            raw_response = response.read().decode("utf-8")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"LIME AI returned HTTP {exc.code}: {body}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Could not reach LIME AI endpoint {endpoint}: {exc.reason}") from exc

    try:
        return json.loads(raw_response) if raw_response else {}
    except json.JSONDecodeError as exc:
        raise RuntimeError("LIME AI returned non-JSON response.") from exc


def _serialize_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _normalize_datetime(value):
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.replace(tzinfo=None)
        return value
    return None
