from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from config.settings import settings


FEATURE_NAMES = [
    "pause_frequency",
    "navigation_count_video",
    "rewatch_segments",
    "playback_rate_change",
    "idle_duration_video",
    "time_on_content",
]

SERVICE_DIR = Path(__file__).resolve().parents[1]
_model = None

LABEL_SCORES = {
    "very low": 1.0,
    "low": 2.0,
    "medium": 3.0,
    "high": 4.0,
    "very high": 5.0,
}


class LocalModelError(RuntimeError):
    pass


def load_local_model():
    global _model
    if _model is None:
        model_path = (SERVICE_DIR / settings.LOCAL_MODEL_PATH).resolve()
        if not model_path.is_file():
            raise LocalModelError(f"Cognitive-load model not found at {model_path}.")
        try:
            artifact = joblib.load(model_path)
        except Exception as exc:
            raise LocalModelError(f"Could not load cognitive-load model at {model_path}: {exc}") from exc

        if isinstance(artifact, dict):
            model = artifact.get("model")
            artifact_features = artifact.get("feature_columns", [])
            if model is None:
                raise LocalModelError(
                    f"Cognitive-load model bundle at {model_path} does not contain a 'model' entry."
                )
        else:
            model = artifact
            artifact_features = []

        model_features = [str(name) for name in getattr(model, "feature_names_in_", [])]
        if not model_features:
            model_features = [str(name) for name in artifact_features]
        if model_features != FEATURE_NAMES:
            raise LocalModelError(
                f"Cognitive-load model features do not match. Expected {FEATURE_NAMES}, got {model_features}."
            )
        if not callable(getattr(model, "predict", None)):
            raise LocalModelError(f"Cognitive-load model at {model_path} does not support prediction.")

        _model = model
    return _model


def predict_scores(feature_matrix) -> np.ndarray:
    values = np.atleast_2d(np.asarray(feature_matrix, dtype=float))
    values = np.maximum(0.0, np.rint(values))
    frame = pd.DataFrame(values, columns=FEATURE_NAMES)
    predictions = np.asarray(load_local_model().predict(frame)).reshape(-1)

    scores = []
    for prediction in predictions:
        value = prediction.item() if hasattr(prediction, "item") else prediction
        if isinstance(value, str):
            score = LABEL_SCORES.get(value.strip().lower())
            if score is None:
                raise LocalModelError(f"Cognitive-load model returned an unknown label: {value!r}.")
            scores.append(score)
        else:
            try:
                scores.append(float(value))
            except (TypeError, ValueError) as exc:
                raise LocalModelError(
                    f"Cognitive-load model returned an unsupported prediction: {value!r}."
                ) from exc

    return np.asarray(scores, dtype=float)
