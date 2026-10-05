import pickle
import pandas as pd
from pathlib import Path

from services.AnalyticWholisticService import aggregate_question_runner_gaze
from services.QuestionRunnerCursorService import aggregate_question_runner_cursor
from database.connection import question_runner_answer_collection


MODEL_PATH = Path("aiModel/cognitive_style_rf.pkl")
FEATURES_PATH = Path("aiModel/feature_columns.pkl")

_model = None
_feature_columns = None


def load_model_once():
    global _model, _feature_columns

    if _model is None:
        with open(MODEL_PATH, "rb") as f:
            _model = pickle.load(f)

    if _feature_columns is None:
        with open(FEATURES_PATH, "rb") as f:
            _feature_columns = pickle.load(f)

    return _model, _feature_columns


async def get_correctness_ratio(session_id: str):
    answers = []
    async for item in question_runner_answer_collection.find({"sessionId": session_id}):
        answers.append(item)

    if not answers:
        return 0.0, 0, 0

    total = len(answers)
    correct = sum(1 for a in answers if a.get("isCorrect") is True)

    return round(correct / total, 4), correct, total


async def build_feature_row(session_id: str):
    gaze = await aggregate_question_runner_gaze(session_id)
    cursor = await aggregate_question_runner_cursor(session_id)
    correctness_ratio, correct_count, total_questions = await get_correctness_ratio(session_id)

    if not gaze and not cursor:
        return None

    gaze = gaze or {}
    cursor = cursor or {}

    feature_row = {
        "facePresentRatio": gaze.get("facePresentRatio", 0),
        "centerRatio": gaze.get("centerRatio", 0),
        "eyesOpenRatio": gaze.get("eyesOpenRatio", 0),

        "yawMean": gaze.get("yawMean", 0),
        "yawStd": gaze.get("yawStd", 0),

        "pitchMean": gaze.get("pitchMean", 0),
        "pitchStd": gaze.get("pitchStd", 0),

        "eyeOffsetXMean": gaze.get("eyeOffsetXMean", 0),
        "eyeOffsetXStd": gaze.get("eyeOffsetXStd", 0),

        "eyeOffsetYMean": gaze.get("eyeOffsetYMean", 0),
        "eyeOffsetYStd": gaze.get("eyeOffsetYStd", 0),

        "avgEyeOpennessMean": gaze.get("avgEyeOpennessMean", 0),
        "avgEyeOpennessStd": gaze.get("avgEyeOpennessStd", 0),

        "gazeConfidenceMean": gaze.get("gazeConfidenceMean", 0),
        "eyeMovementMagnitudeMean": gaze.get("eyeMovementMagnitudeMean", 0),
        "eyeMovementMagnitudeStd": gaze.get("eyeMovementMagnitudeStd", 0),

        "blinkCount": gaze.get("blinkCount", 0),
        "blinkRatePerMin": gaze.get("blinkRatePerMin", 0),
        "directionChangeCount_gaze": gaze.get("directionChangeCount", 0),
        "attentionScore": gaze.get("attentionScore", 0),

        "avgResponseTimeMs": cursor.get("avgResponseTimeMs", 0),
        "avgTotalDistance": cursor.get("avgTotalDistance", 0),
        "avgSpeed": cursor.get("avgSpeed", 0),
        "avgPauseCount": cursor.get("avgPauseCount", 0),
        "avgDirectionChangeCount": cursor.get("avgDirectionChangeCount", 0),
        "avgPathEfficiency": cursor.get("avgPathEfficiency", 0),
        "avgClickCount": cursor.get("avgClickCount", 0),
        "avgTimeToFirstMovementMs": cursor.get("avgTimeToFirstMovementMs", 0),
        "avgPointCount": cursor.get("avgPointCount", 0),

        "correctnessRatio": correctness_ratio,
    }

    return {
        "features": feature_row,
        "correctCount": correct_count,
        "totalQuestions": total_questions,
    }


async def predict_question_runner_cognitive_style(session_id: str):
    model, feature_columns = load_model_once()

    built = await build_feature_row(session_id)
    if not built:
        return {"error": "No gaze or cursor data found for this session"}

    feature_row = built["features"]

    df = pd.DataFrame([feature_row])

    for col in feature_columns:
        if col not in df.columns:
            df[col] = 0

    df = df[feature_columns]

    prediction = model.predict(df)[0]

    probabilities = None
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(df)[0]
        probabilities = {
            cls: float(prob)
            for cls, prob in zip(model.classes_, proba)
        }

    return {
        "sessionId": session_id,
        "cognitiveStyle": prediction,
        "probabilities": probabilities,
        "correctCount": built["correctCount"],
        "totalQuestions": built["totalQuestions"],
        "correctnessRatio": feature_row["correctnessRatio"],
        "features": feature_row,
    }

#Sanjaya requested Function to return only the prediction
async def predict_question_runner_cognitive_style_prediction_only(session_id: str):
    model, feature_columns = load_model_once()

    built = await build_feature_row(session_id)
    if not built:
        return {"error": "No gaze or cursor data found for this session"}

    feature_row = built["features"]

    df = pd.DataFrame([feature_row])

    for col in feature_columns:
        if col not in df.columns:
            df[col] = 0

    df = df[feature_columns]

    prediction = model.predict(df)[0]

    return {
        "cognitiveStyle": prediction
    }