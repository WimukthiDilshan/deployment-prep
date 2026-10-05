# services/QuestionRunnerCognitiveStyleService.py

from database.connection import (
    question_runner_gaze_event_collection,
    question_runner_cursor_event_collection, question_runner_answer_collection,
)
from services.AnalyticWholisticService import aggregate_question_runner_gaze
from services.QuestionRunnerCursorService import aggregate_question_runner_cursor

#
async def get_correctness_ratio(session_id: str):
    answers = []
    async for item in question_runner_answer_collection.find({"sessionId": session_id}):
        answers.append(item)

    if not answers:
        return 0.0, 0, 0

    total = len(answers)
    correct = sum(1 for a in answers if a.get("isCorrect") is True)

    return round(correct / total, 4), correct, total


def clamp(value: float, min_value: float = 0.0, max_value: float = 1.0):
    return max(min_value, min(max_value, value))


async def infer_question_runner_cognitive_style(session_id: str):
    gaze = await aggregate_question_runner_gaze(session_id)
    cursor = await aggregate_question_runner_cursor(session_id)
    correctness_ratio, correct_count, total_questions = await get_correctness_ratio(session_id)

    if not gaze and not cursor:
        return {"error": "No gaze or cursor data found for this session"}

    gaze = gaze or {}
    cursor = cursor or {}

    analytic_score = 0.0
    holistic_score = 0.0
    reasons = []

    # -------------------------
    # GAZE RULES
    # -------------------------
    center_ratio = gaze.get("centerRatio", 0)
    attention_score = gaze.get("attentionScore", 0)
    face_ratio = gaze.get("facePresentRatio", 0)
    eye_movement = gaze.get("eyeMovementMagnitudeMean", 0)
    direction_changes_gaze = gaze.get("directionChangeCount", 0)

    if center_ratio >= 0.6:
        analytic_score += 2.0
        reasons.append("High center gaze ratio suggests focused visual attention.")
    elif center_ratio <= 0.25:
        holistic_score += 2.0
        reasons.append("Low center gaze ratio suggests broader or less centered scanning.")

    if attention_score >= 0.75:
        analytic_score += 2.0
        reasons.append("High attention score suggests stable task focus.")
    elif attention_score <= 0.55:
        holistic_score += 2.0
        reasons.append("Lower attention score suggests less stable focus.")

    if face_ratio >= 0.9:
        analytic_score += 1.0
        reasons.append("High face presence ratio suggests consistent engagement.")
    elif face_ratio <= 0.7:
        holistic_score += 1.0
        reasons.append("Lower face presence ratio suggests reduced continuous engagement.")

    if eye_movement <= 0.02:
        analytic_score += 1.5
        reasons.append("Low eye movement magnitude suggests steadier viewing behavior.")
    elif eye_movement >= 0.035:
        holistic_score += 1.5
        reasons.append("Higher eye movement magnitude suggests broader scanning behavior.")

    if direction_changes_gaze >= 40:
        holistic_score += 1.0
        reasons.append("High gaze direction changes suggest exploratory attention shifts.")
    elif 0 < direction_changes_gaze <= 10:
        analytic_score += 0.5
        reasons.append("Lower gaze direction changes suggest steadier viewing.")

    # -------------------------
    # CURSOR RULES
    # -------------------------
    avg_response_time = cursor.get("avgResponseTimeMs", 0)
    avg_path_efficiency = cursor.get("avgPathEfficiency", 0)
    avg_pause_count = cursor.get("avgPauseCount", 0)
    avg_direction_changes = cursor.get("avgDirectionChangeCount", 0)
    avg_speed = cursor.get("avgSpeed", 0)
    avg_time_to_first_move = cursor.get("avgTimeToFirstMovementMs", 0)

    if avg_path_efficiency >= 0.35:
        analytic_score += 2.5
        reasons.append("Higher cursor path efficiency suggests more direct problem solving.")
    elif avg_path_efficiency <= 0.1:
        holistic_score += 2.5
        reasons.append("Lower cursor path efficiency suggests exploratory or indirect search.")

    if avg_pause_count <= 1.5:
        analytic_score += 1.5
        reasons.append("Lower pause count suggests less hesitation.")
    elif avg_pause_count >= 3:
        holistic_score += 1.5
        reasons.append("Higher pause count suggests more hesitation or exploration.")

    if avg_direction_changes <= 10:
        analytic_score += 1.5
        reasons.append("Fewer cursor direction changes suggest a more direct strategy.")
    elif avg_direction_changes >= 18:
        holistic_score += 1.5
        reasons.append("More cursor direction changes suggest exploratory movement.")

    if 0 < avg_response_time <= 7000:
        analytic_score += 1.0
        reasons.append("Lower average response time suggests faster local identification.")
    elif avg_response_time >= 9000:
        holistic_score += 1.0
        reasons.append("Higher average response time suggests slower exploratory solving.")

    if avg_time_to_first_move <= 250:
        analytic_score += 0.5
        reasons.append("Fast initial movement suggests quick engagement with the item.")
    elif avg_time_to_first_move >= 600:
        holistic_score += 0.5
        reasons.append("Delayed first movement suggests slower exploratory engagement.")

    # avgSpeed is weaker, use only a light rule
    if avg_speed >= 0.28:
        holistic_score += 0.5
        reasons.append("Higher cursor speed may reflect broader scanning or quick exploration.")
    elif 0 < avg_speed <= 0.16:
        analytic_score += 0.5
        reasons.append("Lower cursor speed may reflect more controlled movement.")

    # -------------------------
    # CORRECTNESS RULES
    # -------------------------
    if total_questions > 0:
        if correctness_ratio >= 0.75:
            analytic_score += 2.0
            reasons.append("Higher correctness supports stronger field-independent performance.")
        elif correctness_ratio <= 0.4:
            holistic_score += 2.0
            reasons.append("Lower correctness supports weaker embedded figure extraction performance.")

    total_score = analytic_score + holistic_score
    if total_score == 0:
        return {
            "sessionId": session_id,
            "cognitiveStyle": "unknown",
            "analyticScore": 0,
            "holisticScore": 0,
            "confidence": 0,
            "correctnessRatio": correctness_ratio,
            "reasons": ["Insufficient data to infer cognitive style."],
            "features": {
                "gaze": gaze,
                "cursor": cursor,
                "correctCount": correct_count,
                "totalQuestions": total_questions,
            },
        }

    if analytic_score >= holistic_score:
        style = "analytic"
        confidence = clamp((analytic_score - holistic_score) / total_score)
    else:
        style = "holistic"
        confidence = clamp((holistic_score - analytic_score) / total_score)

    return {
        "sessionId": session_id,
        "cognitiveStyle": style,
        "analyticScore": round(analytic_score, 4),
        "holisticScore": round(holistic_score, 4),
        "confidence": round(confidence, 4),
        "correctnessRatio": correctness_ratio,
        "reasons": reasons,
        "features": {
            "gaze": gaze,
            "cursor": cursor,
            "correctCount": correct_count,
            "totalQuestions": total_questions,
        },
    }