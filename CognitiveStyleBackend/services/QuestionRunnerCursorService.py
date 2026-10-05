# services/QuestionRunnerCursorService.py

from database.connection import (
    question_runner_cursor_event_collection,
    question_runner_cursor_session_collection,
)


async def create_question_runner_cursor_event(event_data: dict):
    result = await question_runner_cursor_event_collection.insert_one(event_data)
    new_event = await question_runner_cursor_event_collection.find_one(
        {"_id": result.inserted_id}
    )

    if new_event:
        new_event["_id"] = str(new_event["_id"])

    return new_event


async def get_question_runner_cursor_events():
    events = []
    async for event in question_runner_cursor_event_collection.find():
        event["_id"] = str(event["_id"])
        events.append(event)
    return events


async def get_question_runner_cursor_events_by_session(session_id: str):
    events = []
    async for event in question_runner_cursor_event_collection.find(
        {"sessionId": session_id}
    ):
        event["_id"] = str(event["_id"])
        events.append(event)
    return events


async def complete_question_runner_cursor_session(session_data: dict):
    session_id = session_data["sessionId"]

    events = []
    async for event in question_runner_cursor_event_collection.find(
        {"sessionId": session_id}
    ):
        events.append(event)

    if not events:
        return {"error": "No cursor events found"}

    total_questions = len(events)

    def avg(field):
        return sum(e.get(field, 0) for e in events) / total_questions

    summary = {
        "sessionId": session_id,
        "userId": session_data.get("userId"),
        "moduleName": session_data.get("moduleName", "QuestionRunner"),

        "totalQuestions": total_questions,

        "avgResponseTime": round(avg("responseTimeMs"), 2),
        "avgDistance": round(avg("totalDistance"), 2),
        "avgSpeed": round(avg("avgSpeed"), 4),

        "avgPauseCount": round(avg("pauseCount"), 2),
        "avgDirectionChanges": round(avg("directionChangeCount"), 2),
        "avgPathEfficiency": round(avg("pathEfficiency"), 4),

        "avgClickCount": round(avg("clickCount"), 2),
        "avgTimeToFirstMove": round(avg("timeToFirstMovementMs"), 2),
    }

    result = await question_runner_cursor_session_collection.insert_one(summary)
    saved = await question_runner_cursor_session_collection.find_one(
        {"_id": result.inserted_id}
    )

    if saved:
        saved["_id"] = str(saved["_id"])

    return saved


async def get_question_runner_cursor_sessions():
    sessions = []
    async for session in question_runner_cursor_session_collection.find():
        session["_id"] = str(session["_id"])
        sessions.append(session)
    return sessions


async def aggregate_question_runner_cursor(session_id: str):
    events = []

    async for event in question_runner_cursor_event_collection.find(
        {"sessionId": session_id}
    ):
        events.append(event)

    if not events:
        return None

    total = len(events)

    def avg(field: str):
        return sum(e.get(field, 0) for e in events) / total if total else 0

    return {
        "totalQuestions": total,

        "avgResponseTimeMs": round(avg("responseTimeMs"), 2),
        "avgTotalDistance": round(avg("totalDistance"), 4),
        "avgSpeed": round(avg("avgSpeed"), 6),
        "avgPauseCount": round(avg("pauseCount"), 4),
        "avgDirectionChangeCount": round(avg("directionChangeCount"), 4),
        "avgPathEfficiency": round(avg("pathEfficiency"), 4),
        "avgClickCount": round(avg("clickCount"), 4),
        "avgTimeToFirstMovementMs": round(avg("timeToFirstMovementMs"), 2),
        "avgPointCount": round(avg("pointCount"), 4),

        "totalDistance": round(sum(e.get("totalDistance", 0) for e in events), 4),
        "totalPauseCount": sum(e.get("pauseCount", 0) for e in events),
        "totalDirectionChangeCount": sum(e.get("directionChangeCount", 0) for e in events),
        "totalClickCount": sum(e.get("clickCount", 0) for e in events),
        "totalPointCount": sum(e.get("pointCount", 0) for e in events),
    }