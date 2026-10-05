from __future__ import annotations

from openai import OpenAI

from config.settings import settings


def has_gpt_api_key() -> bool:
    return bool(settings.GPT_API_KEY and settings.GPT_API_KEY.strip())


def generate_gpt_text(system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
    """Generate text with GPT and raise exceptions to let caller decide fallback behavior."""
    client = OpenAI(api_key=settings.GPT_API_KEY, timeout=settings.GPT_TIMEOUT_SECONDS)

    # Real GPT API call path.
    response = client.chat.completions.create(
        model=settings.GPT_MODEL,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    content = response.choices[0].message.content if response.choices else ""
    return (content or "").strip()
