import joblib
import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "analytic_wholistic_rf_model.pkl"

model = joblib.load(MODEL_PATH)

FEATURE_COLUMNS = [
    "avgSpeed",
    "moveCount",
    "clickCount",
    "zoneSwitchCount",
    "faceRatio",
    "centerRatio",
    "avgYaw",
    "avgPitch",
    "avgConfidence",
    "score",
    "accuracy",
    "avgResponseTimeMs",
]

DEFAULT_FEATURES = {
    "score": 5,
    "accuracy": 0.5,
    "avgResponseTimeMs": 6000,
}

def predict_geft_style(data: dict):
    safe_data = {**DEFAULT_FEATURES, **data}

    X = pd.DataFrame(
        [[safe_data[col] for col in FEATURE_COLUMNS]],
        columns=FEATURE_COLUMNS
    )

    prediction = model.predict(X)[0]
    probabilities = model.predict_proba(X)[0]

    return {
        "prediction": prediction,
        "probabilities": {
            cls: float(prob)
            for cls, prob in zip(model.classes_, probabilities)
        }
    }