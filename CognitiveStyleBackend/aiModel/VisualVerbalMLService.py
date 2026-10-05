import pickle
import pandas as pd
from pathlib import Path

from services.VisualVerbalCursorService import aggregate_simple_cursor
from services.VisualVerbalGazeService import aggregate_visual_gaze

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "visual_verbal_model.pkl"
FEATURES_PATH = BASE_DIR / "visual_verbal_feature_columns.pkl"   # only if this file really exists

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


async def build_visual_verbal_feature_row(session_id: str):
    cursor_data = await aggregate_simple_cursor(session_id)
    gaze_data = await aggregate_visual_gaze(session_id)

    if not cursor_data or not gaze_data:
        return None

    combined = {**cursor_data, **gaze_data}
    return combined


# async def predict_visual_verbal_ml(session_id: str):
#     model, feature_columns = load_model_once()
#
#     feature_row = await build_visual_verbal_feature_row(session_id)
#     if not feature_row:
#         return {"error": "Missing simple cursor or gaze data"}
#
#     df = pd.DataFrame([feature_row])
#
#     for col in feature_columns:
#         if col not in df.columns:
#             df[col] = 0
#
#     df = df[feature_columns]
#
#     prediction = model.predict(df)[0]
#
#     probabilities = None
#     if hasattr(model, "predict_proba"):
#         proba = model.predict_proba(df)[0]
#         probabilities = {
#             cls: float(prob)
#             for cls, prob in zip(model.classes_, proba)
#         }
#
#     return {
#         "sessionId": session_id,
#         "prediction": prediction,
#         "probabilities": probabilities,
#         "features": feature_row,
#     }



async def predict_visual_verbal_ml(session_id: str):
    model, feature_columns = load_model_once()

    feature_row = await build_visual_verbal_feature_row(session_id)
    if not feature_row:
        return {"error": "Missing simple cursor or gaze data"}

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

    # Only return selected features
    selected_feature_keys = [
        "visualTimeRatio",
        "textTimeRatio",
        "avgHoverVisual",
        "avgHoverText",
        "avgSpeedVisual",
        "avgSpeedText",
        "scrollCountVisual",
        "scrollCountText",
        "avgEyeLookInLeft",
        "avgEyeLookInRight",
    ]

    selected_features = {
        key: feature_row.get(key, 0)
        for key in selected_feature_keys
    }

    return {
        "sessionId": session_id,
        "prediction": prediction,
        "probabilities": probabilities,
        "features": selected_features,
    }

#Sanjaya requested Function to return only the prediction
async def predict_visual_verbal_ml_Return_Only_Prediction(session_id: str):
    model, feature_columns = load_model_once()

    feature_row = await build_visual_verbal_feature_row(session_id)
    if not feature_row:
        return {"error": "Missing simple cursor or gaze data"}

    df = pd.DataFrame([feature_row])

    for col in feature_columns:
        if col not in df.columns:
            df[col] = 0

    df = df[feature_columns]

    prediction = model.predict(df)[0]

    return {
        "prediction": prediction
    }