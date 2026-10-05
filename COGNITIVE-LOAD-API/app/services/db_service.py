from app.core.database import get_db_connection
import logging


logger = logging.getLogger(__name__)


def save_raw_interaction_event(event_data: dict):
    query = """
        INSERT INTO raw_interaction_events (
            student_id,
            lesson_id,
            session_id,
            event_type,
            event_time,
            video_time,
            from_position,
            to_position,
            event_value,
            question_id,
            is_correct
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    values = (
        event_data["student_id"],
        event_data["lesson_id"],
        event_data.get("session_id"),
        event_data["event_type"],
        event_data["event_time"],
        event_data.get("video_time"),
        event_data.get("from_position"),
        event_data.get("to_position"),
        event_data.get("event_value"),
        event_data.get("question_id"),
        event_data.get("is_correct"),
    )
    return _execute_insert(query, values)


def get_feature_window_by_bounds(
    student_id: str,
    lesson_id: str,
    session_id: str,
    window_start,
    window_end,
):
    query = """
        SELECT
            id,
            student_id,
            lesson_id,
            session_id,
            minute_index,
            window_start,
            window_end
        FROM feature_windows
        WHERE student_id = %s
          AND lesson_id = %s
          AND session_id = %s
          AND window_start = %s
          AND window_end = %s
        ORDER BY id DESC
        LIMIT 1
    """
    values = (student_id, lesson_id, session_id, window_start, window_end)
    rows = _execute_select(query, values)
    return rows[0] if rows else None


def save_feature_window(feature_data: dict):
    # One student/session/window should have one latest feature row, not duplicates.
    query = """
        INSERT INTO feature_windows (
            student_id,
            lesson_id,
            session_id,
            minute_index,
            window_start,
            window_end,
            pause_frequency,
            navigation_count_video,
            rewatch_segments,
            playback_rate_change,
            idle_duration_video,
            time_on_content,
            navigation_count_adaptation,
            revisit_frequency,
            idle_duration_adaptation,
            quiz_response_time,
            error_rate
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            id = LAST_INSERT_ID(id),
            window_start = VALUES(window_start),
            window_end = VALUES(window_end),
            pause_frequency = VALUES(pause_frequency),
            navigation_count_video = VALUES(navigation_count_video),
            rewatch_segments = VALUES(rewatch_segments),
            playback_rate_change = VALUES(playback_rate_change),
            idle_duration_video = VALUES(idle_duration_video),
            time_on_content = VALUES(time_on_content),
            navigation_count_adaptation = VALUES(navigation_count_adaptation),
            revisit_frequency = VALUES(revisit_frequency),
            idle_duration_adaptation = VALUES(idle_duration_adaptation),
            quiz_response_time = VALUES(quiz_response_time),
            error_rate = VALUES(error_rate)
    """
    values = (
        feature_data["student_id"],
        feature_data["lesson_id"],
        feature_data.get("session_id"),
        feature_data["minute_index"],
        feature_data.get("window_start"),
        feature_data.get("window_end"),
        feature_data["pause_frequency"],
        feature_data["navigation_count_video"],
        feature_data["rewatch_segments"],
        feature_data["playback_rate_change"],
        feature_data["idle_duration_video"],
        feature_data["time_on_content"],
        feature_data["navigation_count_adaptation"],
        feature_data["revisit_frequency"],
        feature_data["idle_duration_adaptation"],
        feature_data["quiz_response_time"],
        feature_data["error_rate"],
    )
    return _execute_insert(query, values)


def save_feature_window_dispatch(dispatch_data: dict):
    query = """
        INSERT INTO feature_window_dispatches (
            feature_window_id,
            student_id,
            lesson_id,
            session_id,
            minute_index,
            window_start,
            window_end,
            target_service,
            status,
            response_message
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    values = (
        dispatch_data.get("feature_window_id"),
        dispatch_data["student_id"],
        dispatch_data["lesson_id"],
        dispatch_data.get("session_id"),
        dispatch_data["minute_index"],
        dispatch_data["window_start"],
        dispatch_data["window_end"],
        dispatch_data["target_service"],
        dispatch_data["status"],
        dispatch_data.get("response_message"),
    )
    return _execute_insert(query, values)


def has_successful_feature_window_dispatch(
    student_id: str,
    lesson_id: str,
    session_id: str,
    window_start,
    window_end,
    target_service: str,
):
    query = """
        SELECT id
        FROM feature_window_dispatches
        WHERE student_id = %s
          AND lesson_id = %s
          AND session_id = %s
          AND window_start = %s
          AND window_end = %s
          AND target_service = %s
          AND status = 'success'
        ORDER BY id DESC
        LIMIT 1
    """
    values = (
        student_id,
        lesson_id,
        session_id,
        window_start,
        window_end,
        target_service,
    )
    rows = _execute_select(query, values)
    return bool(rows)


def save_prediction_log(prediction_data: dict):
    # Keep prediction_logs aligned with the feature window that produced the score.
    query = """
        INSERT INTO prediction_logs (
            feature_window_id,
            student_id,
            lesson_id,
            session_id,
            predicted_cognitive_load,
            predicted_score,
            confidence
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            id = LAST_INSERT_ID(id),
            student_id = VALUES(student_id),
            lesson_id = VALUES(lesson_id),
            session_id = VALUES(session_id),
            predicted_cognitive_load = VALUES(predicted_cognitive_load),
            predicted_score = VALUES(predicted_score),
            confidence = VALUES(confidence)
    """
    values = (
        prediction_data.get("feature_window_id"),
        prediction_data["student_id"],
        prediction_data["lesson_id"],
        prediction_data.get("session_id"),
        prediction_data["predicted_cognitive_load"],
        prediction_data["predicted_score"],
        prediction_data["confidence"],
    )
    return _execute_insert(query, values)


def get_raw_interaction_events(
    student_id: str,
    lesson_id: str,
    session_id: str,
    window_start,
    window_end,
):
    query = """
        SELECT
            id,
            student_id,
            lesson_id,
            session_id,
            event_type,
            event_time,
            video_time,
            from_position,
            to_position,
            event_value,
            question_id,
            is_correct,
            created_at
        FROM raw_interaction_events
        WHERE student_id = %s
          AND lesson_id = %s
          AND session_id = %s
          AND event_time >= %s
          AND event_time < %s
        ORDER BY event_time ASC, id ASC
    """
    values = (student_id, lesson_id, session_id, window_start, window_end)
    return _execute_select(query, values)


def get_event_time_bounds(
    student_id: str,
    lesson_id: str,
    session_id: str,
):
    query = """
        SELECT
            MIN(event_time) AS first_event_time,
            MAX(event_time) AS last_event_time
        FROM raw_interaction_events
        WHERE student_id = %s
          AND lesson_id = %s
          AND session_id = %s
    """
    values = (student_id, lesson_id, session_id)
    rows = _execute_select(query, values)
    return rows[0] if rows else None


def get_latest_successful_dispatch_end(
    student_id: str,
    lesson_id: str,
    session_id: str,
    target_service: str,
):
    query = """
        SELECT window_end
        FROM feature_window_dispatches
        WHERE student_id = %s
          AND lesson_id = %s
          AND session_id = %s
          AND target_service = %s
          AND status = 'success'
        ORDER BY window_end DESC, id DESC
        LIMIT 1
    """
    values = (student_id, lesson_id, session_id, target_service)
    rows = _execute_select(query, values)
    return rows[0]["window_end"] if rows else None


def get_student_lesson_prediction_windows(
    student_id: str,
    lesson_id: str,
    session_id: str | None = None,
    limit: int = 12,
):
    session_filter = ""
    values: tuple

    # Session is optional so teachers can view either one session or the latest lesson history.
    if session_id:
        session_filter = "AND fw.session_id = %s"
        values = (student_id, lesson_id, session_id, limit)
    else:
        values = (student_id, lesson_id, limit)

    query = f"""
        SELECT
            fw.id AS feature_window_id,
            fw.student_id,
            fw.lesson_id,
            fw.session_id,
            fw.minute_index,
            fw.window_start,
            fw.window_end,
            fw.pause_frequency,
            fw.navigation_count_video,
            fw.rewatch_segments,
            fw.playback_rate_change,
            fw.idle_duration_video,
            fw.time_on_content,
            fw.navigation_count_adaptation,
            fw.revisit_frequency,
            fw.idle_duration_adaptation,
            fw.quiz_response_time,
            fw.error_rate,
            pl.predicted_cognitive_load,
            pl.predicted_score,
            pl.confidence,
            COALESCE(pl.created_at, fw.created_at) AS created_at
        FROM feature_windows fw
        LEFT JOIN prediction_logs pl
            ON pl.feature_window_id = fw.id
        WHERE fw.student_id = %s
          AND fw.lesson_id = %s
          {session_filter}
        ORDER BY
            COALESCE(fw.window_start, fw.created_at) DESC,
            fw.minute_index DESC,
            fw.id DESC
        LIMIT %s
    """
    rows = _execute_select(query, values)
    return list(reversed(rows))


def _execute_insert(query: str, values: tuple):
    connection = get_db_connection()

    if connection is None:
        # The rest of the app can still continue, so we fail softly here.
        return None

    cursor = None

    try:
        cursor = connection.cursor()
        cursor.execute(query, values)
        connection.commit()
        return cursor.lastrowid
    except Exception as exc:
        logger.exception("MySQL insert failed: %s", exc)
        return None
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


def _execute_select(query: str, values: tuple):
    connection = get_db_connection()

    if connection is None:
        # An empty result is easier for the feature extraction flow to handle than a hard crash.
        return []

    cursor = None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(query, values)
        return cursor.fetchall()
    except Exception as exc:
        logger.exception("MySQL select failed: %s", exc)
        return []
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()
