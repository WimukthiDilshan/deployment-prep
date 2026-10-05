from services.VisualVerbalCursorService import aggregate_simple_cursor
from services.VisualVerbalGazeService import aggregate_visual_gaze
from services.VisualVerbalModelService import predict_visual_verbal_style

async def analyze_visual_verbal_session(session_id: str):
    cursor_data = await aggregate_simple_cursor(session_id)
    gaze_data = await aggregate_visual_gaze(session_id)

    if not cursor_data or not gaze_data:
        return {"error": "Missing simple cursor or gaze data"}

    combined = {**cursor_data, **gaze_data}

    result = predict_visual_verbal_style(combined)

    return {
        "sessionId": session_id,
        "features": combined,
        "result": result
    }