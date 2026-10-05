from collections.abc import Mapping
from typing import Any

import httpx

from config.settings import settings


class ModelClientError(RuntimeError):
    pass


def _build_url() -> str:
    base_url = settings.MODEL_API_URL.strip().rstrip("/")
    if not base_url:
        raise ModelClientError("MODEL_API_URL is not configured.")

    path = settings.MODEL_API_PREDICT_PATH.strip()
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{base_url}{path}"


def _extract_payload(response_json: Any) -> dict[str, Any]:
    if isinstance(response_json, dict):
        if isinstance(response_json.get("data"), dict):
            return response_json["data"]
        if isinstance(response_json.get("result"), dict):
            return response_json["result"]
        return response_json
    raise ModelClientError("Model response must be a JSON object.")


def request_prediction(payload: Mapping[str, Any]) -> dict[str, Any]:
    url = _build_url()
    timeout = httpx.Timeout(settings.MODEL_API_TIMEOUT_SECONDS)

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, json=dict(payload), headers={"Content-Type": "application/json"})
    except httpx.TimeoutException as exc:
        raise ModelClientError(f"Prediction request timed out for {url}.") from exc
    except httpx.RequestError as exc:
        raise ModelClientError(f"Could not connect to the model API at {url}.") from exc

    if response.status_code >= 400:
        raise ModelClientError(f"Model API returned HTTP {response.status_code}: {response.text.strip()}")

    try:
        response_json = response.json()
    except ValueError as exc:
        raise ModelClientError("Model API response was not valid JSON.") from exc

    return _extract_payload(response_json)
