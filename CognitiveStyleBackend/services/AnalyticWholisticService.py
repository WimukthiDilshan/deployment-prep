# services/AnalyticWholisticService.py

import statistics

from models.AnalyticWholisticModel import (SessionDataIncoming, AggregatedBehavioralDB)
from database.connection import (
    question_runner_gaze_event_collection,
    question_runner_gaze_session_collection,
    analytic_wholistic_behavioral_data,
analytic_wholistic_test_answers
)


async def process_csa_session(data: SessionDataIncoming):
    # 1. Save the Raw Data Immediately
    # This acts as a backup of every click and frame in case you need to re-run models later
    raw_payload = data.model_dump()
    await analytic_wholistic_test_answers.insert_one(raw_payload)

    # 2. Initialize Calculation Variables
    global_rts = []
    local_rts = []
    correct_answers = 0

    global_transitions_total = 0
    local_transitions_total = 0
    global_dwell_total = 0
    local_dwell_total = 0

    # The exact number of questions per block as requested
    TOTAL_GLOBAL_Q = 40
    TOTAL_LOCAL_Q = 40
    PASSING_THRESHOLD = 56  # 70% of 80 questions

    # 3. Process Behavioral Answers (Accuracy & Response Times)
    for q_id_str, answer in data.answers.items():
        q_id = int(q_id_str)

        # Track total accuracy
        if answer.isCorrect:
            correct_answers += 1

        # Sort Response Times into Global (1-40) and Local (41-80)
        if q_id <= 40:
            global_rts.append(answer.responseTimeMs)
        else:
            local_rts.append(answer.responseTimeMs)

    # Calculate Medians (Using statistics library to automatically handle middle values)
    median_rt_global = statistics.median(global_rts) if global_rts else 0.0
    median_rt_local = statistics.median(local_rts) if local_rts else 0.0

    # 4. Process Eye-Tracking Data (Transitions & Dwell Time)
    for gaze in data.gazeWindows:
        if gaze.questionId <= 40:
            global_transitions_total += gaze.transitions
            global_dwell_total += gaze.totalDwellTime
        else:
            local_transitions_total += gaze.transitions
            local_dwell_total += gaze.totalDwellTime

        # Grab the userId (stored as sessionId in React payload)
        user_id = gaze.sessionId

        # Calculate Averages (Divided strictly by 40)
    avg_transitions_global = global_transitions_total / TOTAL_GLOBAL_Q
    avg_transitions_local = local_transitions_total / TOTAL_LOCAL_Q
    avg_dwell_global = global_dwell_total / TOTAL_GLOBAL_Q
    avg_dwell_local = local_dwell_total / TOTAL_LOCAL_Q

    # 5. Apply the 30% Error Rate Threshold Constraint
    # If correct_answers < 56, this boolean becomes False,
    # signaling to your ML Model to exclude this row during training.
    is_valid_for_model = correct_answers >= PASSING_THRESHOLD

    # 6. Map to the Final Database Payload
    aggregated_payload = AggregatedBehavioralDB(
        userId=user_id,
        Median_RT_Global=round(median_rt_global, 2),
        Median_RT_Local=round(median_rt_local, 2),
        Avg_Transitions_Global=round(avg_transitions_global, 2),
        Avg_Transitions_Local=round(avg_transitions_local, 2),
        Avg_Dwell_Time_Global=round(avg_dwell_global, 2),
        Avg_Dwell_Time_Local=round(avg_dwell_local, 2),
        Total_Accuracy=correct_answers,
        IsValidForModel=is_valid_for_model
    )

    # 7. Insert the Aggregated Profile into MongoDB
    db_payload = aggregated_payload.model_dump()
    result = await analytic_wholistic_behavioral_data.insert_one(db_payload)

    # 8. Return formatted response (converting ObjectId to string for JSON)
    db_payload["_id"] = str(result.inserted_id)

    return db_payload
























async def create_question_runner_gaze_event(event_data: dict):
    result = await question_runner_gaze_event_collection.insert_one(event_data)
    new_event = await question_runner_gaze_event_collection.find_one(
        {"_id": result.inserted_id}
    )

    if new_event:
        new_event["_id"] = str(new_event["_id"])

    return new_event


async def get_question_runner_gaze_events():
    events = []
    async for event in question_runner_gaze_event_collection.find():
        event["_id"] = str(event["_id"])
        events.append(event)
    return events


async def get_question_runner_gaze_events_by_session(session_id: str):
    events = []
    async for event in question_runner_gaze_event_collection.find(
        {"sessionId": session_id}
    ):
        event["_id"] = str(event["_id"])
        events.append(event)
    return events


async def complete_question_runner_gaze_session(session_data: dict):
    session_id = session_data["sessionId"]

    events = []
    async for event in question_runner_gaze_event_collection.find(
        {"sessionId": session_id}
    ):
        events.append(event)

    if not events:
        return {"error": "No QuestionRunner gaze events found for this session"}

    total_windows = len(events)

    def avg(field: str):
        return sum(event.get(field, 0) for event in events) / total_windows if total_windows else 0

    session_summary = {
        "sessionId": session_id,
        "userId": session_data.get("userId"),
        "moduleName": session_data.get("moduleName", "QuestionRunner"),
        "totalWindows": total_windows,

        "facePresentRatio": round(avg("facePresentRatio"), 4),
        "centerRatio": round(avg("centerRatio"), 4),
        "eyesOpenRatio": round(avg("eyesOpenRatio"), 4),

        "yawMean": round(avg("yawMean"), 4),
        "yawStd": round(avg("yawStd"), 4),

        "pitchMean": round(avg("pitchMean"), 4),
        "pitchStd": round(avg("pitchStd"), 4),

        "eyeOffsetXMean": round(avg("eyeOffsetXMean"), 4),
        "eyeOffsetXStd": round(avg("eyeOffsetXStd"), 4),

        "eyeOffsetYMean": round(avg("eyeOffsetYMean"), 4),
        "eyeOffsetYStd": round(avg("eyeOffsetYStd"), 4),

        "avgEyeOpennessMean": round(avg("avgEyeOpennessMean"), 4),
        "avgEyeOpennessStd": round(avg("avgEyeOpennessStd"), 4),

        "gazeConfidenceMean": round(avg("gazeConfidenceMean"), 4),

        "eyeMovementMagnitudeMean": round(avg("eyeMovementMagnitudeMean"), 4),
        "eyeMovementMagnitudeStd": round(avg("eyeMovementMagnitudeStd"), 4),

        "blinkCount": sum(event.get("blinkCount", 0) for event in events),
        "blinkRatePerMin": round(avg("blinkRatePerMin"), 4),
        "directionChangeCount": sum(event.get("directionChangeCount", 0) for event in events),
        "attentionScore": round(avg("attentionScore"), 4),
    }

    result = await question_runner_gaze_session_collection.insert_one(session_summary)
    saved_summary = await question_runner_gaze_session_collection.find_one(
        {"_id": result.inserted_id}
    )

    if saved_summary:
        saved_summary["_id"] = str(saved_summary["_id"])

    return saved_summary


async def get_question_runner_gaze_sessions():
    sessions = []
    async for session in question_runner_gaze_session_collection.find():
        session["_id"] = str(session["_id"])
        sessions.append(session)
    return sessions


async def aggregate_question_runner_gaze(session_id: str):
    events = []

    async for event in question_runner_gaze_event_collection.find(
        {"sessionId": session_id}
    ):
        events.append(event)

    if not events:
        return None

    total = len(events)

    def avg(field: str):
        return sum(e.get(field, 0) for e in events) / total if total else 0

    return {
        "facePresentRatio": round(avg("facePresentRatio"), 4),
        "centerRatio": round(avg("centerRatio"), 4),
        "eyesOpenRatio": round(avg("eyesOpenRatio"), 4),

        "yawMean": round(avg("yawMean"), 4),
        "yawStd": round(avg("yawStd"), 4),

        "pitchMean": round(avg("pitchMean"), 4),
        "pitchStd": round(avg("pitchStd"), 4),

        "eyeOffsetXMean": round(avg("eyeOffsetXMean"), 4),
        "eyeOffsetXStd": round(avg("eyeOffsetXStd"), 4),

        "eyeOffsetYMean": round(avg("eyeOffsetYMean"), 4),
        "eyeOffsetYStd": round(avg("eyeOffsetYStd"), 4),

        "avgEyeOpennessMean": round(avg("avgEyeOpennessMean"), 4),
        "avgEyeOpennessStd": round(avg("avgEyeOpennessStd"), 4),

        "gazeConfidenceMean": round(avg("gazeConfidenceMean"), 4),
        "eyeMovementMagnitudeMean": round(avg("eyeMovementMagnitudeMean"), 4),
        "eyeMovementMagnitudeStd": round(avg("eyeMovementMagnitudeStd"), 4),

        "blinkCount": sum(e.get("blinkCount", 0) for e in events),
        "blinkRatePerMin": round(avg("blinkRatePerMin"), 4),
        "directionChangeCount": sum(e.get("directionChangeCount", 0) for e in events),
        "attentionScore": round(avg("attentionScore"), 4),
    }