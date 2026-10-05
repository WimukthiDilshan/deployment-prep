import os

import joblib


# Build an absolute path to the trained model file.
model_path = os.path.join(os.path.dirname(__file__), "..", "..", "model", "cognitive_load_model.pkl")

# Load the model once at startup so other modules can import and reuse it.
try:
    model_artifact = joblib.load(model_path)
except Exception as exc:
    raise RuntimeError(f"Failed to load cognitive load model from {model_path}: {exc}") from exc

if isinstance(model_artifact, dict) and "model" in model_artifact:
    model = model_artifact["model"]
    model_metadata = {
        "artifact_type": "model_bundle",
        "feature_columns": model_artifact.get("feature_columns", []),
        "class_order": model_artifact.get("class_order", []),
        "sklearn_version": model_artifact.get("sklearn_version"),
    }
else:
    model = model_artifact
    model_metadata = {
        "artifact_type": "raw_model",
        "feature_columns": [],
        "class_order": [],
        "sklearn_version": None,
    }

if hasattr(model, "steps"):
    for step_name, step_model in model.steps:
        if hasattr(step_model, "n_jobs"):
            model.set_params(**{f"{step_name}__n_jobs": 1})
elif hasattr(model, "set_params") and hasattr(model, "n_jobs"):
    model.set_params(n_jobs=1)


def get_model_metadata():
    return {
        "model_path": model_path,
        **model_metadata,
        "model_type": type(model).__name__,
        "n_features_in": getattr(model, "n_features_in_", None),
        "feature_names_in": list(getattr(model, "feature_names_in_", [])),
        "classes": [
            cls.item() if hasattr(cls, "item") else cls
            for cls in getattr(model, "classes_", [])
        ],
    }

# Simple startup log to confirm the model is ready.
print(f"New Model loaded successfully from {model_path}")
