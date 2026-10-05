from typing import Any

import httpx

from config.settings import settings


class GeminiServiceError(RuntimeError):
    """Raised when Gemini cannot generate a usable response."""


def generate_gemini_text(
    system_prompt: str,
    user_prompt: str,
    *,
    response_mime_type: str | None = None,
    temperature: float | None = None,
    max_output_tokens: int | None = None,
) -> str:
    if not settings.GEMINI_API_KEY.strip():
        raise GeminiServiceError("GEMINI_API_KEY must be configured.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    generation_config: dict[str, Any] = {
        "temperature": settings.GEMINI_TEMPERATURE if temperature is None else temperature,
        "maxOutputTokens": (
            settings.GEMINI_MAX_OUTPUT_TOKENS
            if max_output_tokens is None
            else max_output_tokens
        ),
    }
    if response_mime_type:
        generation_config["responseMimeType"] = response_mime_type

    payload: dict[str, Any] = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": generation_config,
    }
    try:
        with httpx.Client(timeout=httpx.Timeout(settings.GEMINI_TIMEOUT_SECONDS)) as client:
            response = client.post(url, params={"key": settings.GEMINI_API_KEY}, json=payload)
            response.raise_for_status()
        content = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise GeminiServiceError(f"Gemini request failed: {exc}") from exc
    if not isinstance(content, str) or not content.strip():
        raise GeminiServiceError("Gemini returned an empty response.")
    return content.strip()
