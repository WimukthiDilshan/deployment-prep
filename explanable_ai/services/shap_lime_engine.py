from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np
import shap
from lime.lime_tabular import LimeTabularExplainer

from models.explanation_models import ExplanationFactor
from services.prediction_microservice_client import (
    PredictionMicroserviceError,
    predict_proba_batch,
    predict_single,
    prediction_label_from_payload,
)


RAW_FEATURE_NAMES = [
    "pause_frequency",
    "navigation_count_video",
    "rewatch_segments",
    "playback_rate_change",
    "idle_duration_video",
    "time_on_content",
    "navigation_count_adaptation",
    "revisit_frequency",
    "idle_duration_adaptation",
    "quiz_response_time",
    "error_rate",
]

# Keep a stable mapping between the summary fields in this project and the raw model inputs.
AVG_TO_RAW_FEATURE_NAME = {
    f"avg_{name}": name for name in RAW_FEATURE_NAMES
}

DISPLAY_FEATURE_NAMES = RAW_FEATURE_NAMES

CLASS_LABELS = ["Very Low", "Low", "Medium", "High", "Very High"]


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _normalize_feature_values(feature_values: Mapping[str, Any]) -> dict[str, Any]:
    """Convert avg_* summary keys into the raw feature names expected by the model API."""
    normalized: dict[str, Any] = {}
    for avg_name, raw_name in AVG_TO_RAW_FEATURE_NAME.items():
        normalized[raw_name] = feature_values.get(avg_name)
    for key, value in feature_values.items():
        if key not in AVG_TO_RAW_FEATURE_NAME:
            normalized[key] = value
    return normalized


def _build_row_from_mapping(feature_values: Mapping[str, Any]) -> list[float]:
    normalized_values = _normalize_feature_values(feature_values)
    return [_to_float(normalized_values.get(name)) for name in RAW_FEATURE_NAMES]


def _build_target_matrix(feature_values: Mapping[str, Any]) -> np.ndarray:
    return np.array([_build_row_from_mapping(feature_values)], dtype=float)


def _build_background_matrix(
    feature_values: Mapping[str, Any],
    background_rows: Sequence[Mapping[str, Any]] | None,
) -> np.ndarray:
    # Build background from lesson rows when possible; otherwise synthesize around target row.
    rows: list[list[float]] = []

    if background_rows:
        for row in background_rows:
            rows.append(_build_row_from_mapping(row))

    if not rows:
        base_row = _build_row_from_mapping(feature_values)
        rows.extend([base_row])
        for scale in (0.85, 0.95, 1.05, 1.15):
            rows.append([value * scale for value in base_row])

    return np.array(rows, dtype=float)


def _prediction_function(feature_matrix: np.ndarray) -> np.ndarray:
    # SHAP/LIME call this function; it bridges local explainers to remote model probabilities.
    feature_rows = [
        {feature_name: float(row[index]) for index, feature_name in enumerate(RAW_FEATURE_NAMES)}
        for row in feature_matrix
    ]
    return np.asarray(predict_proba_batch(feature_rows, CLASS_LABELS), dtype=float)


def _class_index(prediction_payload: Mapping[str, Any]) -> int:
    label = prediction_label_from_payload(prediction_payload)
    if label in CLASS_LABELS:
        return CLASS_LABELS.index(label)
    return 2


def _impact_from_value(value: float) -> str:
    if value > 0:
        return "positive"
    if value < 0:
        return "negative"
    return "neutral"


def _parse_lime_feature(feature_text: str) -> str:
    for separator in ("<=", ">=", "<", ">", "="):
        if separator in feature_text:
            return feature_text.split(separator, 1)[0].strip()
    return feature_text.strip()


def _build_factor(
    feature_name: str,
    feature_value: float,
    score: float,
    impact: str,
    explanation_kind: str,
    predicted_label: str,
) -> ExplanationFactor:
    display_value = round(feature_value, 4)
    if explanation_kind == "SHAP":
        reason = (
            f"Real SHAP value from the microservice-backed prediction for '{predicted_label}'. "
            f"This feature contributes {score:.4f} to the prediction." 
        )
    else:
        reason = (
            f"Real LIME weight from the microservice-backed prediction for '{predicted_label}'. "
            f"This feature contributes {score:.4f} to the local explanation."
        )
    return ExplanationFactor(
        feature=feature_name,
        value=display_value,
        score=round(abs(score), 4),
        impact=impact,
        reason=reason,
    )


def _rank_and_limit(factors: list[ExplanationFactor], limit: int = 3) -> list[ExplanationFactor]:
    return sorted(factors, key=lambda factor: abs(factor.score), reverse=True)[:limit]


def _resolve_agreed(shap_factors: list[ExplanationFactor], lime_factors: list[ExplanationFactor]) -> list[ExplanationFactor]:
    shap_features = {factor.feature for factor in shap_factors}
    lime_features = {factor.feature for factor in lime_factors}
    shared = shap_features & lime_features
    agreed = [factor for factor in shap_factors if factor.feature in shared]
    return _rank_and_limit(agreed, limit=3)


def compute_shap_and_lime(
    feature_values: Mapping[str, Any],
    background_rows: Sequence[Mapping[str, Any]] | None = None,
) -> tuple[list[ExplanationFactor], list[ExplanationFactor], str]:
    """Compute real SHAP and LIME explanations using the other member's prediction API."""
    target_matrix = _build_target_matrix(feature_values)
    background_matrix = _build_background_matrix(feature_values, background_rows)

    prediction_payload = predict_single(feature_values)
    predicted_label = prediction_label_from_payload(prediction_payload)
    class_index = _class_index(prediction_payload)

    # SHAP runs locally using the teammate API as the black-box model function.
    shap_explainer = shap.KernelExplainer(_prediction_function, background_matrix)
    shap_values = shap_explainer.shap_values(target_matrix, nsamples="auto")
    if isinstance(shap_values, list):
        class_shap_values = np.asarray(shap_values[class_index][0], dtype=float)
    else:
        class_shap_values = np.asarray(shap_values[0], dtype=float)

    # LIME runs locally with the same model function for consistent attribution behavior.
    lime_explainer = LimeTabularExplainer(
        training_data=background_matrix,
        feature_names=DISPLAY_FEATURE_NAMES,
        class_names=CLASS_LABELS,
        mode="classification",
        discretize_continuous=True,
        random_state=42,
    )
    lime_explanation = lime_explainer.explain_instance(
        data_row=target_matrix[0],
        predict_fn=_prediction_function,
        top_labels=1,
        num_features=len(RAW_FEATURE_NAMES),
    )
    lime_map = dict(lime_explanation.as_map().get(class_index, []))

    shap_factors: list[ExplanationFactor] = []
    lime_factors: list[ExplanationFactor] = []

    normalized_feature_values = _normalize_feature_values(feature_values)

    for index, feature_name in enumerate(RAW_FEATURE_NAMES):
        feature_value = _to_float(normalized_feature_values.get(feature_name))

        shap_score = float(class_shap_values[index]) if index < len(class_shap_values) else 0.0
        shap_factors.append(
            _build_factor(
                feature_name=feature_name,
                feature_value=feature_value,
                score=shap_score,
                impact=_impact_from_value(shap_score),
                explanation_kind="SHAP",
                predicted_label=predicted_label,
            )
        )

        lime_score = float(lime_map.get(index, 0.0))
        lime_factors.append(
            _build_factor(
                feature_name=feature_name,
                feature_value=feature_value,
                score=lime_score,
                impact=_impact_from_value(lime_score),
                explanation_kind="LIME",
                predicted_label=predicted_label,
            )
        )

    return _rank_and_limit(shap_factors), _rank_and_limit(lime_factors), predicted_label
