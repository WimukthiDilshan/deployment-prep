from app.services.db_service import get_raw_interaction_events


def extract_feature_window_from_raw(data: dict):
    # Read only the raw events for the requested learner/session window.
    events = get_raw_interaction_events(
        student_id=data["student_id"],
        lesson_id=data["lesson_id"],
        session_id=data["session_id"],
        window_start=data["window_start"],
        window_end=data["window_end"],
    )

    pause_frequency = 0
    navigation_count_video = 0
    rewatch_segments = 0
    playback_rate_change = 0
    idle_duration_video = 0
    navigation_count_adaptation = 0
    revisit_frequency = 0
    idle_duration_adaptation = 0
    quiz_response_time = 0
    quiz_attempts = 0
    quiz_errors = 0

    last_quiz_response_time = None
    current_idle_start = None

    for event in events:
        event_type = event["event_type"]

        if event_type == "pause":
            pause_frequency += 1
        elif event_type == "seek_forward":
            navigation_count_video += 1
        elif event_type == "seek_backward":
            rewatch_segments += 1
        elif event_type == "rate_change":
            playback_rate_change += 1
        elif event_type == "adaptation_navigation":
            navigation_count_adaptation += 1
        elif event_type == "adaptation_revisit":
            revisit_frequency += 1
        elif event_type == "adaptation_idle":
            idle_duration_adaptation += _safe_int(event.get("event_value"))
        elif event_type == "idle_start":
            current_idle_start = event["event_time"]
        elif event_type == "idle_end":
            # Idle duration is reconstructed from the start/end pair instead of storing a row every second.
            if current_idle_start is not None:
                idle_duration_video += _duration_seconds(current_idle_start, event["event_time"])
                current_idle_start = None
        elif event_type == "quiz_submit":
            quiz_attempts += 1

            if event.get("is_correct") is False:
                quiz_errors += 1

            last_quiz_response_time = _safe_int(event.get("event_value"))

    if current_idle_start is not None:
        # If the learner is still idle when the window closes, cap the idle time at window_end.
        idle_duration_video += _duration_seconds(current_idle_start, data["window_end"])

    if last_quiz_response_time is not None:
        quiz_response_time = last_quiz_response_time

    window_seconds = max(
        0,
        int((data["window_end"] - data["window_start"]).total_seconds()),
    )
    time_on_content = max(window_seconds - idle_duration_video, 0)
    # Keep the model schema stable for 2-minute windows that have no quiz interaction yet.
    error_rate = (quiz_errors / quiz_attempts) if quiz_attempts > 0 else 0

    return {
        "student_id": data["student_id"],
        "lesson_id": data["lesson_id"],
        "session_id": data["session_id"],
        "minute_index": data["minute_index"],
        "window_start": data["window_start"],
        "window_end": data["window_end"],
        "pause_frequency": pause_frequency,
        "navigation_count_video": navigation_count_video,
        "rewatch_segments": rewatch_segments,
        "playback_rate_change": playback_rate_change,
        "idle_duration_video": idle_duration_video,
        "time_on_content": time_on_content,
        "navigation_count_adaptation": navigation_count_adaptation,
        "revisit_frequency": revisit_frequency,
        "idle_duration_adaptation": idle_duration_adaptation,
        "quiz_response_time": quiz_response_time,
        "error_rate": round(error_rate, 2),
        "raw_event_count": len(events),
    }


def _safe_int(value):
    if value in (None, ""):
        return 0

    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _duration_seconds(start_time, end_time):
    normalized_start = _normalize_datetime(start_time)
    normalized_end = _normalize_datetime(end_time)
    return max(0, int((normalized_end - normalized_start).total_seconds()))


def _normalize_datetime(value):
    if value.tzinfo is not None:
        return value.replace(tzinfo=None)

    return value
