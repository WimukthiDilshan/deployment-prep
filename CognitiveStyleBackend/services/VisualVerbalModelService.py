from services.VisualVerbalCursorService import aggregate_simple_cursor
from services.VisualVerbalGazeService import aggregate_visual_gaze


def predict_visual_verbal_style(features: dict, visual_panel_side: str = "left"):
    visual_score = 0.0
    verbal_score = 0.0

    # 1) Time ratio
    visual_score += features.get("visualTimeRatio", 0.0) * 4.0
    verbal_score += features.get("textTimeRatio", 0.0) * 4.0

    # 2) Hover ratio
    avg_hover_visual = features.get("avgHoverVisual", 0.0)
    avg_hover_text = features.get("avgHoverText", 0.0)
    hover_total = avg_hover_visual + avg_hover_text
    if hover_total > 0:
        visual_score += (avg_hover_visual / hover_total) * 2.0
        verbal_score += (avg_hover_text / hover_total) * 2.0

    # 3) Scroll ratio
    scroll_visual = features.get("scrollCountVisual", 0)
    scroll_text = features.get("scrollCountText", 0)
    scroll_total = scroll_visual + scroll_text
    if scroll_total > 0:
        visual_score += (scroll_visual / scroll_total) * 1.5
        verbal_score += (scroll_text / scroll_total) * 1.5

    # 4) Click ratio
    click_visual = features.get("clickCountVisual", 0)
    click_text = features.get("clickCountText", 0)
    click_total = click_visual + click_text
    if click_total > 0:
        visual_score += (click_visual / click_total) * 1.0
        verbal_score += (click_text / click_total) * 1.0

    # 5) Gaze mapping
    look_left_ratio = features.get("lookLeftRatio", 0.0)
    look_right_ratio = features.get("lookRightRatio", 0.0)
    avg_eye_left = features.get("avgEyeLookInLeft", 0.0)
    avg_eye_right = features.get("avgEyeLookInRight", 0.0)

    if visual_panel_side == "left":
        visual_gaze_ratio = look_left_ratio
        verbal_gaze_ratio = look_right_ratio
        visual_eye = avg_eye_left
        verbal_eye = avg_eye_right
    else:
        visual_gaze_ratio = look_right_ratio
        verbal_gaze_ratio = look_left_ratio
        visual_eye = avg_eye_right
        verbal_eye = avg_eye_left

    visual_score += visual_gaze_ratio * 2.5
    verbal_score += verbal_gaze_ratio * 2.5

    eye_total = visual_eye + verbal_eye
    if eye_total > 0:
        visual_score += (visual_eye / eye_total) * 1.5
        verbal_score += (verbal_eye / eye_total) * 1.5

    # 6) Small penalty for excessive switching
    zone_switch_count = features.get("zoneSwitchCount", 0)
    if zone_switch_count >= 6:
        visual_score -= 0.2
        verbal_score -= 0.2

    prediction = "Visual" if visual_score >= verbal_score else "Verbal"

    total_score = visual_score + verbal_score
    if total_score > 0:
        visual_prob = visual_score / total_score
        verbal_prob = verbal_score / total_score
    else:
        visual_prob = 0.5
        verbal_prob = 0.5

    return {
        "prediction": prediction,
        "probabilities": {
            "Visual": round(visual_prob, 4),
            "Verbal": round(verbal_prob, 4),
        },
        "scores": {
            "Visual": round(visual_score, 4),
            "Verbal": round(verbal_score, 4),
        },
    }


async def analyze_visual_verbal_session(session_id: str):
    cursor_data = await aggregate_simple_cursor(session_id)
    gaze_data = await aggregate_visual_gaze(session_id)

    if not cursor_data or not gaze_data:
        return {"error": "Missing simple cursor or gaze data"}

    combined = {**cursor_data, **gaze_data}

    result = predict_visual_verbal_style(
        combined,
        visual_panel_side="left"
    )

    return {
        "sessionId": session_id,
        "features": combined,
        "result": result
    }