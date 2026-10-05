from typing import Any

import httpx

from config.settings import settings


class GeminiServiceError(RuntimeError):
    pass


def generate_gemini_text(system_prompt: str, user_prompt: str) -> tuple[str, str]:
    if not settings.GEMINI_API_KEY.strip():
        raise GeminiServiceError("GEMINI_API_KEY must be configured.")
    model = settings.GEMINI_MODEL.strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload: dict[str, Any] = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": settings.GEMINI_TEMPERATURE, "maxOutputTokens": settings.GEMINI_MAX_OUTPUT_TOKENS},
    }
    try:
        response = httpx.post(url, params={"key": settings.GEMINI_API_KEY}, json=payload, timeout=settings.GEMINI_TIMEOUT_SECONDS)
        response.raise_for_status()
        content = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise GeminiServiceError(f"Gemini request failed: {exc}") from exc
    if not isinstance(content, str) or not content.strip():
        raise GeminiServiceError("Gemini returned an empty explanation.")
    return content.strip(), model
