from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

import httpx

from config.settings import settings


class PredictionMicroserviceError(RuntimeError):
    """Raised when the other member's prediction microservice cannot be reached or parsed."""


FEATURE_PREFIX = "avg_"
SCORE_TO_LABEL = {
    1: "Very Low",
    2: "Low",
    3: "Medium",
    4: "High",
    5: "Very High",
}

LABEL_NORMALIZATION = {
    "very low": "Very Low",
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "very high": "Very High",
}


def _build_url() -> str:
    base_url = settings.EXPLAINABILITY_MICROSERVICE_URL.strip().rstrip("/")
    path = settings.EXPLAINABILITY_MICROSERVICE_PATH.strip()
    if not base_url:
        raise PredictionMicroserviceError("EXPLAINABILITY_MICROSERVICE_URL is not configured.")
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{base_url}{path}"


def _extract_prediction_payload(response_json: Any) -> dict[str, Any]:
    # Accept a few common envelope formats used by teammate services.
    if isinstance(response_json, dict):
        if isinstance(response_json.get("data"), dict):
            return response_json["data"]
        if isinstance(response_json.get("result"), dict):
            return response_json["result"]
        return response_json
    raise PredictionMicroserviceError("Prediction microservice response must be a JSON object.")


def _normalize_feature_name(feature_name: str) -> str:
    """Convert summary-style avg_* keys to the raw feature names expected by the model API."""
    if feature_name.startswith(FEATURE_PREFIX):
        return feature_name[len(FEATURE_PREFIX) :]
    return feature_name


def _feature_payload(feature_values: Mapping[str, Any]) -> dict[str, Any]:
    # Always send raw feature names and numeric values to prediction API.
    payload: dict[str, Any] = {}
    for key, value in feature_values.items():
        normalized_key = _normalize_feature_name(key)
        payload[normalized_key] = None if value is None else float(value)
    return payload


def prediction_label_from_payload(payload: Mapping[str, Any]) -> str:
    """Extract a cognitive-load label from either text labels or numeric score output."""
    for key in ("predicted_label", "predicted_cognitive_load", "final_cognitive_load", "cognitive_load"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            normalized = value.strip()
            canonical = LABEL_NORMALIZATION.get(normalized.lower())
            if canonical is not None:
                return canonical
            try:
                numeric = int(float(normalized))
            except ValueError:
                return normalized
            if numeric in SCORE_TO_LABEL:
                return SCORE_TO_LABEL[numeric]

    # Support numeric score output style: 1..5 mapped to the agreed label set.
    for key in ("score", "predicted_score", "cognitive_load_score", "label_score"):
        raw_score = payload.get(key)
        if raw_score is None:
            continue
        try:
            score = int(float(raw_score))
        except (TypeError, ValueError):
            continue
        if score in SCORE_TO_LABEL:
            return SCORE_TO_LABEL[score]

    return "Medium"


def predict_single(feature_values: Mapping[str, Any]) -> dict[str, Any]:
    """Ask the other member's microservice for the cognitive load prediction of one feature row."""
    url = _build_url()
    timeout = httpx.Timeout(settings.EXPLAINABILITY_MICROSERVICE_TIMEOUT_SECONDS)
    payload = {"features": _feature_payload(feature_values)}

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, json=payload, headers={"Content-Type": "application/json"})
    except httpx.TimeoutException as exc:
        raise PredictionMicroserviceError(f"Prediction request timed out for {url}.") from exc
    except httpx.RequestError as exc:
        raise PredictionMicroserviceError(f"Could not connect to prediction microservice at {url}.") from exc

    if response.status_code >= 400:
        raise PredictionMicroserviceError(
            f"Prediction microservice returned HTTP {response.status_code}: {response.text.strip()}"
        )

    try:
        response_json = response.json()
    except ValueError as exc:
        raise PredictionMicroserviceError("Prediction microservice response was not valid JSON.") from exc

    return _extract_prediction_payload(response_json)


def _parse_probability_array(value: Any, expected_length: int) -> list[float] | None:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return None
    try:
        probabilities = [float(item) for item in value]
    except (TypeError, ValueError):
        return None
    if len(probabilities) != expected_length:
        return None
    return probabilities


def predict_proba_batch(feature_rows: Sequence[Mapping[str, Any]], class_labels: Sequence[str]) -> list[list[float]]:
    """Return probability rows for a batch by querying the microservice one row at a time."""
    probabilities: list[list[float]] = []

    for feature_values in feature_rows:
        payload = predict_single(feature_values)

        # Prefer explicit probability arrays when provided by the model API.
        for key in ("probabilities", "class_probabilities", "proba", "prediction_proba"):
            parsed = _parse_probability_array(payload.get(key), len(class_labels))
            if parsed is not None:
                probabilities.append(parsed)
                break
        else:
            # Fallback to one-hot probabilities from predicted label.
            predicted_label = prediction_label_from_payload(payload)
            fallback = [0.0] * len(class_labels)
            if predicted_label in class_labels:
                fallback[class_labels.index(predicted_label)] = 1.0
            else:
                fallback[0] = 1.0
            probabilities.append(fallback)

    return probabilities
