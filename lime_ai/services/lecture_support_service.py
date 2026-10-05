import re
from typing import Any

from services.gemini_client import GeminiServiceError, generate_gemini_text


SYSTEM_PROMPT = (
    "You are an expert, supportive learning advisor speaking directly to the student. Give specific, "
    "realistic actions the student can follow during the current or next lecture. Adapt the amount "
    "of scaffolding to the reported cognitive-load level. Always use 'you' and 'your'. Never refer "
    "to the learner as 'the student', 'they', or 'them', and never invent personal information."
)
USER_PROMPT_TEMPLATE = (
    "Student ID: {student_id}\n"
    "Lesson ID: {lesson_id}\n"
    "Predicted cognitive load: {predicted_label}\n"
    "Behavioral signals:\n{signals_text}\n\n"
    "Write exactly four short recommendations directly to the student. Include actions for staying "
    "engaged during the lecture, handling difficult content, and checking understanding. Tailor every "
    "recommendation to the observed behaviors and cognitive-load level. Each item must begin with a "
    "direct action verb and explain briefly how it helps. Use 'Write down' instead of the phrase 'Jot down'. "
    "Do not explain model results or mention LIME, SHAP, "
    "features, drivers, signals, pressure, or relief. Use encouraging, simple language and return "
    "only a plain-text numbered list with no heading, introduction, Markdown, or bold formatting. "
    "Keep each item to one sentence and the complete response under 120 words."
)


def _clean_strategy(text: str) -> str:
    cleaned = re.sub(r"[*_`]+", "", text).strip()
    return re.sub(r"^jot down\b", "Write down", cleaned, flags=re.IGNORECASE)


def generate_lecture_support(
    *, student_id: str, lesson_id: str, predicted_label: str, signals: list[str]
) -> dict[str, Any]:
    prompt = USER_PROMPT_TEMPLATE.format(
        student_id=student_id,
        lesson_id=lesson_id,
        predicted_label=predicted_label,
        signals_text="\n".join(f"- {signal}" for signal in signals) or "- none detected",
    )
    response = generate_gemini_text(SYSTEM_PROMPT, prompt)

    strategies: list[str] = []
    pattern = re.compile(r"^\s*\d+\s*[).:-]\s*(.+)$")
    for line in response.splitlines():
        match = pattern.match(line)
        if match and len(match.group(1).strip()) >= 8:
            strategies.append(_clean_strategy(match.group(1)))

    # Preserve useful advice if a model ignores the requested numbering.
    if not strategies:
        for line in response.splitlines():
            candidate = re.sub(r"^\s*[-*]\s*", "", line).strip()
            if len(candidate) >= 8 and not candidate.endswith(":"):
                strategies.append(_clean_strategy(candidate))

    if not strategies:
        strategies = [
            _clean_strategy(sentence)
            for sentence in re.split(r"(?<=[.!?])\s+", response.strip())
            if len(sentence.strip()) >= 8
        ]

    if not strategies:
        raise GeminiServiceError("Gemini did not return usable lecture-support recommendations.")

    text = "\n".join(f"{index + 1}) {item}" for index, item in enumerate(strategies[:5]))
    return {"strategies": text, "source": "gemini"}
