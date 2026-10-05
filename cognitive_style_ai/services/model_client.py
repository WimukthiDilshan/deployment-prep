from pathlib import Path
import hashlib

import joblib
import numpy as np
import pandas as pd

from config.settings import settings


class ModelClientError(RuntimeError):
    pass


SERVICE_DIR = Path(__file__).resolve().parents[1]
_model = None
_feature_names = None
_label_encoder = None
_model_signature = None


def load_model():
    global _model, _feature_names, _label_encoder
    if _model is None:
        model_path = (SERVICE_DIR / settings.COGNITIVE_STYLE_MODEL_PATH).resolve()
        if not model_path.is_file():
            raise ModelClientError(f"Cognitive-style model not found at {model_path}.")
        try:
            _model = joblib.load(model_path)
        except ModuleNotFoundError as exc:
            raise ModelClientError(
                f"Could not load cognitive-style model at {model_path}: missing Python dependency "
                f"{exc.name!r}. Install the cognitive_style_ai requirements."
            ) from exc
        except Exception as exc:
            raise ModelClientError(f"Could not load cognitive-style model at {model_path}: {exc}") from exc

    if _label_encoder is None:
        encoder_path = (SERVICE_DIR / settings.COGNITIVE_STYLE_LABEL_ENCODER_PATH).resolve()
        if not encoder_path.is_file():
            raise ModelClientError(f"Cognitive-style label encoder not found at {encoder_path}.")
        try:
            _label_encoder = joblib.load(encoder_path)
        except Exception as exc:
            raise ModelClientError(
                f"Could not load cognitive-style label encoder at {encoder_path}: {exc}"
            ) from exc

    if _feature_names is None:
        if hasattr(_model, "feature_names_in_"):
            _feature_names = [str(name) for name in _model.feature_names_in_]
        else:
            raise ModelClientError("The visual/verbal model does not expose its feature names.")
    if not callable(getattr(_model, "predict_proba", None)):
        raise ModelClientError("The visual/verbal model does not expose prediction probabilities.")
    if not callable(getattr(_label_encoder, "inverse_transform", None)):
        raise ModelClientError("The visual/verbal label encoder is invalid.")
    return _model, _feature_names, _label_encoder


def get_model_signature() -> str:
    """Identify the loaded model/encoder pair so stale saved analyses can be refreshed."""
    global _model_signature
    if _model_signature is not None:
        return _model_signature

    load_model()
    digest = hashlib.sha256()
    for configured_path in (
        settings.COGNITIVE_STYLE_MODEL_PATH,
        settings.COGNITIVE_STYLE_LABEL_ENCODER_PATH,
    ):
        asset_path = (SERVICE_DIR / configured_path).resolve()
        with asset_path.open("rb") as asset:
            for chunk in iter(lambda: asset.read(1024 * 1024), b""):
                digest.update(chunk)
    _model_signature = digest.hexdigest()[:24]
    return _model_signature


class BatchPredictor:
    def __init__(self, feature_names: list[str] | None = None, classes: list[str] | None = None):
        self.model, model_features, label_encoder = load_model()
        self.feature_names = model_features
        self.classes = [str(value) for value in label_encoder.inverse_transform(self.model.classes_)]

        if feature_names and list(feature_names) != self.feature_names:
            raise ModelClientError("CognitiveStyleBackend features do not match the visual/verbal model.")
        if classes and set(classes) != set(self.classes):
            raise ModelClientError("CognitiveStyleBackend classes do not match the visual/verbal model.")

    def probabilities(self, matrix) -> np.ndarray:
        values = np.atleast_2d(np.asarray(matrix, dtype=float))
        frame = pd.DataFrame(values, columns=self.feature_names)
        return np.asarray(self.model.predict_proba(frame), dtype=float)


def get_model_metadata() -> tuple[list[str], list[str]]:
    predictor = BatchPredictor()
    return predictor.feature_names, predictor.classes
