# from database.connection import gaze_event_collection, gaze_session_collection
#
#
# async def create_gaze_event(event_data: dict):
#     result = await gaze_event_collection.insert_one(event_data)
#     new_event = await gaze_event_collection.find_one({"_id": result.inserted_id})
#
#     if new_event:
#         new_event["_id"] = str(new_event["_id"])
#
#     return new_event
#
#
# async def get_gaze_events_by_session(session_id: str):
#     events = []
#     async for event in gaze_event_collection.find({"sessionId": session_id}):
#         event["_id"] = str(event["_id"])
#         events.append(event)
#     return events
#
#
# async def complete_gaze_session(session_data: dict):
#     session_id = session_data["sessionId"]
#
#     events = []
#     async for event in gaze_event_collection.find({"sessionId": session_id}):
#         events.append(event)
#
#     if not events:
#         return {"error": "No gaze data found"}
#
#     total_frames = sum(e.get("frameCount", 0) for e in events)
#
#     face_present_ratio = sum(e.get("facePresentRatio", 0) for e in events) / len(events)
#     center_ratio = sum(e.get("centerGazeRatio", 0) for e in events) / len(events)
#
#     avg_yaw = sum(e.get("avgYaw", 0) for e in events) / len(events)
#     avg_pitch = sum(e.get("avgPitch", 0) for e in events) / len(events)
#
#     avg_eye_offset_x = sum(e.get("avgEyeOffsetX", 0) for e in events) / len(events)
#     avg_eye_offset_y = sum(e.get("avgEyeOffsetY", 0) for e in events) / len(events)
#
#     avg_eye_openness = sum(e.get("avgEyeOpenness", 0) for e in events) / len(events)
#     avg_confidence = sum(e.get("avgGazeConfidence", 0) for e in events) / len(events)
#
#     total_blinks = sum(e.get("blinkCount", 0) for e in events)
#
#     session_summary = {
#         "sessionId": session_id,
#         "userId": session_data.get("userId"),
#         "moduleName": session_data.get("moduleName", "module2"),
#
#         "totalWindows": len(events),
#         "totalFrames": total_frames,
#
#         "facePresentRatio": round(face_present_ratio, 4),
#         "centerGazeRatio": round(center_ratio, 4),
#
#         "avgYaw": round(avg_yaw, 2),
#         "avgPitch": round(avg_pitch, 2),
#
#         "avgEyeOffsetX": round(avg_eye_offset_x, 4),
#         "avgEyeOffsetY": round(avg_eye_offset_y, 4),
#
#         "avgEyeOpenness": round(avg_eye_openness, 4),
#         "avgGazeConfidence": round(avg_confidence, 4),
#
#         "totalBlinkCount": total_blinks,
#     }
#
#     result = await gaze_session_collection.insert_one(session_summary)
#     saved = await gaze_session_collection.find_one({"_id": result.inserted_id})
#
#     if saved:
#         saved["_id"] = str(saved["_id"])
#
#     return saved
#
#
# async def get_gaze_sessions():
#     sessions = []
#     async for session in gaze_session_collection.find():
#         session["_id"] = str(session["_id"])
#         sessions.append(session)
#     return sessions
#
#
# async def aggregate_visual_gaze(session_id: str):
#     events = []
#
#     async for event in gaze_event_collection.find({"sessionId": session_id}):
#         events.append(event)
#
#     if not events:
#         return None
#
#     total = len(events)
#
#     return {
#         "facePresentRatio": round(sum(e.get("facePresentRatio", 0) for e in events) / total, 4),
#         "centerGazeRatio": round(sum(e.get("centerGazeRatio", 0) for e in events) / total, 4),
#         "avgYaw": round(sum(e.get("avgYaw", 0) for e in events) / total, 2),
#         "avgPitch": round(sum(e.get("avgPitch", 0) for e in events) / total, 2),
#         "avgEyeOffsetX": round(sum(e.get("avgEyeOffsetX", 0) for e in events) / total, 4),
#         "avgEyeOffsetY": round(sum(e.get("avgEyeOffsetY", 0) for e in events) / total, 4),
#         "avgEyeOpenness": round(sum(e.get("avgEyeOpenness", 0) for e in events) / total, 4),
#         "avgGazeConfidence": round(sum(e.get("avgGazeConfidence", 0) for e in events) / total, 4),
#         "blinkCount": int(sum(e.get("blinkCount", 0) for e in events)),
#     }


#
# from database.connection import gaze_event_collection, gaze_session_collection
#
#
# async def create_gaze_event(event_data: dict):
#     result = await gaze_event_collection.insert_one(event_data)
#     new_event = await gaze_event_collection.find_one({"_id": result.inserted_id})
#
#     if new_event:
#         new_event["_id"] = str(new_event["_id"])
#
#     return new_event
#
#
# async def get_gaze_events_by_session(session_id: str):
#     events = []
#     async for event in gaze_event_collection.find({"sessionId": session_id}):
#         event["_id"] = str(event["_id"])
#         events.append(event)
#     return events
#
#
# async def complete_gaze_session(session_data: dict):
#     session_id = session_data["sessionId"]
#
#     events = []
#     async for event in gaze_event_collection.find({"sessionId": session_id}):
#         events.append(event)
#
#     if not events:
#         return {"error": "No gaze data found"}
#
#     total_windows = len(events)
#     total_frames = sum(e.get("frameCount", 0) for e in events)
#
#     def avg(field, digits=4):
#         return round(sum(e.get(field, 0) for e in events) / total_windows, digits)
#
#     session_summary = {
#         "sessionId": session_id,
#         "userId": session_data.get("userId"),
#         "moduleName": session_data.get("moduleName", "module2"),
#
#         "totalWindows": total_windows,
#         "totalFrames": total_frames,
#
#         "facePresentRatio": avg("facePresentRatio", 4),
#         "avgYaw": avg("avgYaw", 2),
#         "avgPitch": avg("avgPitch", 2),
#
#         "avgEyeOffsetX": avg("avgEyeOffsetX", 4),
#         "avgEyeOffsetY": avg("avgEyeOffsetY", 4),
#         "avgLeftEyeOffsetX": avg("avgLeftEyeOffsetX", 4),
#         "avgRightEyeOffsetX": avg("avgRightEyeOffsetX", 4),
#         "avgEyeOffsetDisagreementX": avg("avgEyeOffsetDisagreementX", 4),
#
#         "avgEyeOpenness": avg("avgEyeOpenness", 4),
#         "avgGazeConfidence": avg("avgGazeConfidence", 4),
#
#         "avgNoseTipX": avg("avgNoseTipX", 4),
#         "avgNoseTipY": avg("avgNoseTipY", 4),
#         "avgFaceCenterX": avg("avgFaceCenterX", 4),
#         "avgFaceCenterY": avg("avgFaceCenterY", 4),
#         "avgFaceWidth": avg("avgFaceWidth", 4),
#         "avgFaceHeight": avg("avgFaceHeight", 4),
#         "avgEyeCenterX": avg("avgEyeCenterX", 4),
#
#         "avgDeltaYaw": avg("avgDeltaYaw", 4),
#         "avgDeltaEyeOffsetX": avg("avgDeltaEyeOffsetX", 4),
#         "avgDeltaFaceCenterX": avg("avgDeltaFaceCenterX", 4),
#         "avgDeltaNoseTipX": avg("avgDeltaNoseTipX", 4),
#
#         "leftMoveRatio": avg("leftMoveRatio", 4),
#         "rightMoveRatio": avg("rightMoveRatio", 4),
#         "stableRatio": avg("stableRatio", 4),
#
#         "movementSwitchCount": int(round(sum(e.get("movementSwitchCount", 0) for e in events))),
#         "totalBlinkCount": int(sum(e.get("blinkCount", 0) for e in events)),
#     }
#
#     result = await gaze_session_collection.insert_one(session_summary)
#     saved = await gaze_session_collection.find_one({"_id": result.inserted_id})
#
#     if saved:
#         saved["_id"] = str(saved["_id"])
#
#     return saved
#
#
# async def get_gaze_sessions():
#     sessions = []
#     async for session in gaze_session_collection.find():
#         session["_id"] = str(session["_id"])
#         sessions.append(session)
#     return sessions
#
#
# async def aggregate_visual_gaze(session_id: str):
#     events = []
#
#     async for event in gaze_event_collection.find({"sessionId": session_id}):
#         events.append(event)
#
#     if not events:
#         return None
#
#     total = len(events)
#
#     def avg(field, digits=4):
#         return round(sum(e.get(field, 0) for e in events) / total, digits)
#
#     return {
#         "facePresentRatio": avg("facePresentRatio", 4),
#         "avgYaw": avg("avgYaw", 2),
#         "avgPitch": avg("avgPitch", 2),
#
#         "avgEyeOffsetX": avg("avgEyeOffsetX", 4),
#         "avgEyeOffsetY": avg("avgEyeOffsetY", 4),
#         "avgLeftEyeOffsetX": avg("avgLeftEyeOffsetX", 4),
#         "avgRightEyeOffsetX": avg("avgRightEyeOffsetX", 4),
#         "avgEyeOffsetDisagreementX": avg("avgEyeOffsetDisagreementX", 4),
#
#         "avgEyeOpenness": avg("avgEyeOpenness", 4),
#         "avgGazeConfidence": avg("avgGazeConfidence", 4),
#
#         "avgNoseTipX": avg("avgNoseTipX", 4),
#         "avgNoseTipY": avg("avgNoseTipY", 4),
#         "avgFaceCenterX": avg("avgFaceCenterX", 4),
#         "avgFaceCenterY": avg("avgFaceCenterY", 4),
#         "avgFaceWidth": avg("avgFaceWidth", 4),
#         "avgFaceHeight": avg("avgFaceHeight", 4),
#         "avgEyeCenterX": avg("avgEyeCenterX", 4),
#
#         "avgDeltaYaw": avg("avgDeltaYaw", 4),
#         "avgDeltaEyeOffsetX": avg("avgDeltaEyeOffsetX", 4),
#         "avgDeltaFaceCenterX": avg("avgDeltaFaceCenterX", 4),
#         "avgDeltaNoseTipX": avg("avgDeltaNoseTipX", 4),
#
#         "leftMoveRatio": avg("leftMoveRatio", 4),
#         "rightMoveRatio": avg("rightMoveRatio", 4),
#         "stableRatio": avg("stableRatio", 4),
#
#         "movementSwitchCount": int(round(sum(e.get("movementSwitchCount", 0) for e in events) / total)),
#         "blinkCount": int(sum(e.get("blinkCount", 0) for e in events)),
#     }



from database.connection import visual_verbal_gaze_collection, visual_verbal_gaze_session_collection
from models.VisualVerbalGazeWithLimitedInputs import GazeEventIncoming,GazeEventDB

#Commenting out to test the model with limited inputs
# async def create_gaze_event(event_data: dict):
#     result = await visual_verbal_gaze_collection.insert_one(event_data)
#     new_event = await visual_verbal_gaze_collection.find_one({"_id": result.inserted_id})
#
#     if new_event:
#         new_event["_id"] = str(new_event["_id"])
#
#     return new_event
#
# Assuming visual_verbal_gaze_collection is imported here

async def create_gaze_event_service(event: GazeEventIncoming):
    # 1. Calculate the ImageGazeRatio safely
    image_gaze_ratio = 0.0
    if event.totalActiveTimeMs > 0:
        image_gaze_ratio = event.visualGazeTimeMs / event.totalActiveTimeMs

    # 2. Map the data into the DB Model
    # Here we explicitly set timeTakenMs = event.totalActiveTimeMs
    db_payload = GazeEventDB(
        userId=event.userId,
        FirstInteractionPreference=event.firstInteractionPreference,
        ImageGazeRatio=round(image_gaze_ratio, 4),
        timeTakenMs=event.totalActiveTimeMs
    )

    # 3. Insert into MongoDB
    result = await visual_verbal_gaze_collection.insert_one(db_payload.model_dump())

    # 4. Fetch and format the response
    new_event = await visual_verbal_gaze_collection.find_one({"_id": result.inserted_id})

    if new_event:
        new_event["_id"] = str(new_event["_id"])

    return new_event




async def get_gaze_events_by_session(session_id: str):
    events = []
    async for event in visual_verbal_gaze_collection.find({"sessionId": session_id}):
        event["_id"] = str(event["_id"])
        events.append(event)
    return events


async def complete_gaze_session(session_data: dict):
    session_id = session_data["sessionId"]

    events = []
    async for event in visual_verbal_gaze_collection.find({"sessionId": session_id}):
        events.append(event)

    if not events:
        return {"error": "No gaze data found"}

    total_windows = len(events)
    total_frames = sum(e.get("frameCount", 0) for e in events)

    if total_frames == 0:
        return {"error": "No frame data found"}

    def avg(field, digits=4):
        return round(sum(e.get(field, 0) for e in events) / total_windows, digits)

    total_look_left_frames = sum(e.get("lookLeftFrames", 0) for e in events)
    total_look_right_frames = sum(e.get("lookRightFrames", 0) for e in events)
    total_center_frames = sum(e.get("centerFrames", 0) for e in events)

    look_left_ratio = round(total_look_left_frames / total_frames, 4)
    look_right_ratio = round(total_look_right_frames / total_frames, 4)
    center_ratio = round(total_center_frames / total_frames, 4)

    if total_look_left_frames > total_look_right_frames:
        dominant_gaze = "LEFT"
    elif total_look_right_frames > total_look_left_frames:
        dominant_gaze = "RIGHT"
    else:
        dominant_gaze = "CENTER"

    session_summary = {
        "sessionId": session_id,
        "userId": session_data.get("userId"),
        "moduleName": session_data.get("moduleName", "module2"),

        "totalWindows": total_windows,
        "totalFrames": total_frames,

        "facePresentRatio": avg("facePresentRatio", 4),

        "totalLookLeftFrames": total_look_left_frames,
        "totalLookRightFrames": total_look_right_frames,
        "totalCenterFrames": total_center_frames,

        "lookLeftRatio": look_left_ratio,
        "lookRightRatio": look_right_ratio,
        "centerRatio": center_ratio,

        "avgEyeLookInLeft": avg("avgEyeLookInLeft", 6),
        "avgEyeLookInRight": avg("avgEyeLookInRight", 6),
        "avgLookDiff": avg("avgLookDiff", 6),

        "dominantGaze": dominant_gaze,
    }

    result = await visual_verbal_gaze_session_collection.insert_one(session_summary)
    saved = await visual_verbal_gaze_session_collection.find_one({"_id": result.inserted_id})

    if saved:
        saved["_id"] = str(saved["_id"])

    return saved


async def get_gaze_sessions():
    sessions = []
    async for session in visual_verbal_gaze_session_collection.find():
        session["_id"] = str(session["_id"])
        sessions.append(session)
    return sessions


# async def aggregate_visual_gaze(session_id: str):
#     events = []
#
#     async for event in gaze_event_collection.find({"sessionId": session_id}):
#         events.append(event)
#
#     if not events:
#         return None
#
#     total_windows = len(events)
#     total_frames = sum(e.get("frameCount", 0) for e in events)
#
#     if total_frames == 0:
#         return None
#
#     def avg(field, digits=4):
#         return round(sum(e.get(field, 0) for e in events) / total_windows, digits)
#
#     total_look_left_frames = sum(e.get("lookLeftFrames", 0) for e in events)
#     total_look_right_frames = sum(e.get("lookRightFrames", 0) for e in events)
#     total_center_frames = sum(e.get("centerFrames", 0) for e in events)
#
#     look_left_ratio = round(total_look_left_frames / total_frames, 4)
#     look_right_ratio = round(total_look_right_frames / total_frames, 4)
#     center_ratio = round(total_center_frames / total_frames, 4)
#
#     if total_look_left_frames > total_look_right_frames:
#         dominant_gaze = "LEFT"
#     elif total_look_right_frames > total_look_left_frames:
#         dominant_gaze = "RIGHT"
#     else:
#         dominant_gaze = "CENTER"
#
#     return {
#         "facePresentRatio": avg("facePresentRatio", 4),
#
#         "totalLookLeftFrames": total_look_left_frames,
#         "totalLookRightFrames": total_look_right_frames,
#         "totalCenterFrames": total_center_frames,
#
#         "lookLeftRatio": look_left_ratio,
#         "lookRightRatio": look_right_ratio,
#         "centerRatio": center_ratio,
#
#         "avgEyeLookInLeft": avg("avgEyeLookInLeft", 6),
#         "avgEyeLookInRight": avg("avgEyeLookInRight", 6),
#         "avgLookDiff": avg("avgLookDiff", 6),
#
#         "dominantGaze": dominant_gaze,
#     }

async def aggregate_visual_gaze(session_id: str):
    events = []

    async for event in visual_verbal_gaze_collection.find({"sessionId": session_id}):
        events.append(event)

    if not events:
        return None

    total_windows = len(events)
    total_frames = sum(e.get("frameCount", 0) for e in events)

    if total_frames == 0:
        return None

    def avg(field, digits=4):
        return round(sum(e.get(field, 0) for e in events) / total_windows, digits)

    look_left_frames = int(sum(e.get("lookLeftFrames", 0) for e in events))
    look_right_frames = int(sum(e.get("lookRightFrames", 0) for e in events))
    center_frames = int(sum(e.get("centerFrames", 0) for e in events))
    blink_count = int(sum(e.get("blinkCount", 0) for e in events))

    avg_eye_look_in_left = avg("avgEyeLookInLeft", 6)
    avg_eye_look_in_right = avg("avgEyeLookInRight", 6)
    avg_look_diff = avg("avgLookDiff", 6)

    dominant_left_score = round(max(avg_eye_look_in_left - avg_eye_look_in_right, 0.0), 6)
    dominant_right_score = round(max(avg_eye_look_in_right - avg_eye_look_in_left, 0.0), 6)

    return {
        "facePresentRatio": avg("facePresentRatio", 4),

        "lookLeftFrames": look_left_frames,
        "lookRightFrames": look_right_frames,
        "centerFrames": center_frames,

        "lookLeftRatio": round(look_left_frames / total_frames, 4),
        "lookRightRatio": round(look_right_frames / total_frames, 4),
        "centerRatio": round(center_frames / total_frames, 4),

        "avgEyeLookInLeft": avg_eye_look_in_left,
        "avgEyeLookInRight": avg_eye_look_in_right,
        "avgLookDiff": avg_look_diff,

        "dominantLeftScore": dominant_left_score,
        "dominantRightScore": dominant_right_score,

        "blinkCount": blink_count,
    }