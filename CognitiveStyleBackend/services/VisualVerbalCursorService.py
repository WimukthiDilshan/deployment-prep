from database.connection import visual_verbal_cursor_collection, visual_verbal_cursor_session_collection



#Commenting out prev impl to check less input impl
# async def create_simple_event(event_data: dict):
#     result = await visual_verbal_cursor_collection.insert_one(event_data)
#     new_event = await visual_verbal_cursor_collection.find_one({"_id": result.inserted_id})
#
#     if new_event:
#         new_event["_id"] = str(new_event["_id"])
#
#     return new_event

async def create_simple_event(event_data: dict):
    # Extract raw values from the incoming dictionary
    visual_time = event_data.get("visualTimeMs", 0)
    text_time = event_data.get("textTimeMs", 0)
    visual_scrolls = event_data.get("visualScrolls", 0)
    text_scrolls = event_data.get("textScrolls", 0)
    total_active_time = event_data.get("totalActiveTimeMs", 0)

    # Calculation 1: Image Cursor Ratio (visual vs total)
    total_time = visual_time + text_time
    if total_time > 0:
        image_cursor_ratio = round(visual_time / total_time, 4)
    else:
        image_cursor_ratio = 0.5  # Neutral baseline if no movement

    # Calculation 2: Image Scroll Ratio (visual vs total)
    total_scrolls = visual_scrolls + text_scrolls
    if total_scrolls > 0:
        image_scroll_ratio = round(visual_scrolls / total_scrolls, 4)
    else:
        image_scroll_ratio = 0.5  # Neutral baseline if no scrolling

    # Create the clean document optimized for your ML model
    db_document = {
        "userId": event_data.get("userId"),
        "timeTakenMs": total_active_time,
        "imageCursorRatio": image_cursor_ratio,
        "imageScrollRatio": image_scroll_ratio
    }

    # Database insertion
    result = await visual_verbal_cursor_collection.insert_one(db_document)

    # Retrieve the inserted document
    new_event = await visual_verbal_cursor_collection.find_one({"_id": result.inserted_id})

    # Format the MongoDB ObjectId to a string before returning
    if new_event:
        new_event["_id"] = str(new_event["_id"])

    return new_event

async def get_simple_events():
    events = []
    async for event in visual_verbal_cursor_collection.find():
        event["_id"] = str(event["_id"])
        events.append(event)
    return events


async def get_simple_events_by_session(session_id: str):
    events = []
    async for event in visual_verbal_cursor_collection.find({"sessionId": session_id}):
        event["_id"] = str(event["_id"])
        events.append(event)
    return events


async def complete_simple_session(session_data: dict):
    session_id = session_data["sessionId"]

    events = []
    async for event in visual_verbal_cursor_collection.find({"sessionId": session_id}):
        events.append(event)

    if not events:
        return {"error": "No events found for this session"}

    total_visual_ratio = sum(event.get("visualTimeRatio", 0) for event in events)
    total_text_ratio = sum(event.get("textTimeRatio", 0) for event in events)

    avg_hover_visual = (
        sum(event.get("avgHoverVisual", 0) for event in events) / len(events)
    )
    avg_hover_text = (
        sum(event.get("avgHoverText", 0) for event in events) / len(events)
    )

    avg_speed_visual = (
        sum(event.get("avgSpeedVisual", 0) for event in events) / len(events)
    )
    avg_speed_text = (
        sum(event.get("avgSpeedText", 0) for event in events) / len(events)
    )

    click_count_visual = sum(event.get("clickCountVisual", 0) for event in events)
    click_count_text = sum(event.get("clickCountText", 0) for event in events)

    scroll_count_visual = sum(event.get("scrollCountVisual", 0) for event in events)
    scroll_count_text = sum(event.get("scrollCountText", 0) for event in events)

    zone_switch_count = sum(event.get("zoneSwitchCount", 0) for event in events)

    total_windows = len(events)
    final_visual_ratio = total_visual_ratio / total_windows
    final_text_ratio = total_text_ratio / total_windows

    session_summary = {
        "sessionId": session_id,
        "userId": session_data.get("userId"),
        "moduleName": session_data.get("moduleName", "module2"),
        "totalWindows": total_windows,
        "finalVisualTimeRatio": round(final_visual_ratio, 4),
        "finalTextTimeRatio": round(final_text_ratio, 4),
        "avgHoverVisual": round(avg_hover_visual, 2),
        "avgHoverText": round(avg_hover_text, 2),
        "avgSpeedVisual": round(avg_speed_visual, 4),
        "avgSpeedText": round(avg_speed_text, 4),
        "clickCountVisual": click_count_visual,
        "clickCountText": click_count_text,
        "scrollCountVisual": scroll_count_visual,
        "scrollCountText": scroll_count_text,
        "zoneSwitchCount": zone_switch_count,
    }

    result = await visual_verbal_cursor_session_collection.insert_one(session_summary)
    saved_summary = await visual_verbal_cursor_session_collection.find_one({"_id": result.inserted_id})

    if saved_summary:
        saved_summary["_id"] = str(saved_summary["_id"])

    return saved_summary


async def get_simple_sessions():
    sessions = []
    async for session in visual_verbal_cursor_session_collection.find():
        session["_id"] = str(session["_id"])
        sessions.append(session)
    return sessions


async def aggregate_simple_cursor(session_id: str):
    events = []

    async for event in visual_verbal_cursor_collection.find({"sessionId": session_id}):
        events.append(event)

    if not events:
        return None

    total = len(events)

    avg_visual_time_ratio = sum(e.get("visualTimeRatio", 0) for e in events) / total
    avg_text_time_ratio = sum(e.get("textTimeRatio", 0) for e in events) / total

    avg_hover_visual = sum(e.get("avgHoverVisual", 0) for e in events) / total
    avg_hover_text = sum(e.get("avgHoverText", 0) for e in events) / total

    avg_speed_visual = sum(e.get("avgSpeedVisual", 0) for e in events) / total
    avg_speed_text = sum(e.get("avgSpeedText", 0) for e in events) / total

    total_click_visual = sum(e.get("clickCountVisual", 0) for e in events)
    total_click_text = sum(e.get("clickCountText", 0) for e in events)

    total_scroll_visual = sum(e.get("scrollCountVisual", 0) for e in events)
    total_scroll_text = sum(e.get("scrollCountText", 0) for e in events)

    total_zone_switch = sum(e.get("zoneSwitchCount", 0) for e in events)

    return {
        "visualTimeRatio": round(avg_visual_time_ratio, 4),
        "textTimeRatio": round(avg_text_time_ratio, 4),
        "avgHoverVisual": round(avg_hover_visual, 2),
        "avgHoverText": round(avg_hover_text, 2),
        "avgSpeedVisual": round(avg_speed_visual, 4),
        "avgSpeedText": round(avg_speed_text, 4),
        "clickCountVisual": int(total_click_visual),
        "clickCountText": int(total_click_text),
        "scrollCountVisual": int(total_scroll_visual),
        "scrollCountText": int(total_scroll_text),
        "zoneSwitchCount": int(total_zone_switch),
    }