import json
import re
from typing import Any

from config.settings import settings
from services.gemini_client import GeminiServiceError, generate_gemini_text
from services.study_technique_service import TECHNIQUES


GUIDANCE_VERSION = "human-in-loop-technique-v4"
TECHNIQUE_PROMPT_VERSION = "constrained-technique-selection-v2"
TECHNIQUE_TEMPERATURE = 0.1
GUIDANCE_MAX_OUTPUT_TOKENS = 1024


SYSTEM_PROMPT = (
    "You are an expert educational assistant. Produce teacher-facing cognitive-load reasoning and "
    "student-facing learning guidance from only the supplied result and observed behaviors. Never "
    "mention LIME, SHAP, algorithms, models, features, drivers, signals, weights, scores, confidence, "
    "formulas, IDs, raw field names, pressure, relief, or analysis terminology inside teacher_explanation. "
    "That explanation must be understandable without technical or data-science knowledge and must explain "
    "only why the reported cognitive-load level was selected. Keep advice exclusively in the separate "
    "student-guidance fields. The structured technique evidence may use its requested technical field names. "
    "Return only valid JSON matching the requested structure."
)

USER_PROMPT_TEMPLATE = """Student ID: {student_id}
Lesson ID: {lesson_id}
Predicted cognitive load: {predicted_label}
Behaviors for the teacher explanation:
{human_signals_text}

Behaviors for student guidance:
{signals_text}

Allowed study-technique catalogue:
{technique_catalogue_json}

Return this JSON object:
{{
  "teacher_explanation": "one paragraph",
  "study_techniques": [
    {{
      "name": "exact candidate title",
      "reason": "one concise sentence connecting the supplied behaviour to the technique",
      "matched_signals": ["exact supplied behaviour text"]
    }}
  ],
  "lecture_recommendations": ["recommendation 1", "recommendation 2", "recommendation 3", "recommendation 4"]
}}

Requirements:
- teacher_explanation must start exactly with "This student has {predicted_label} cognitive load because",
  use clear everyday third-person language, connect the observed lesson actions into a simple reason for
  the selected load level without inventing facts, and contain 65-100 words. It must contain no advice,
  recommendations, study strategies, IDs, raw behavior names, numbers, percentages, or technical terms.
  Use cautious wording such as "suggests" or "may indicate" and describe only this lesson, not a permanent
  condition or diagnosis. End by restating why the combined behaviour supports the reported load level.
- Select one or two study_techniques only from the supplied five-item catalogue. Consider the predicted
  cognitive-load level, the observed behaviours, and each technique's stated purpose.
- Copy matched_signals exactly from Behaviors for student guidance. Do not invent or paraphrase behaviours.
- If no behaviour is supplied, return an empty matched_signals list and base the cautious reason on the
  reported load level and technique purpose.
- The reason must explain why the matched behaviour and predicted load make the technique suitable. Do not
  claim that the technique is guaranteed to improve learning.
- Provide exactly four short lecture_recommendations addressed directly to the student using "you" or
  "your". Each must start with a direct action verb, explain briefly how it helps, and be one sentence.
- Include actions for staying engaged, handling difficult content, and checking understanding.
- Use "Write down" instead of "Jot down".
- Do not add Markdown, headings, or text outside the JSON object.
"""


def _parse_json_object(response: str) -> dict[str, Any]:
    text = response.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GeminiServiceError("Gemini returned malformed student-guidance JSON.") from exc
    if not isinstance(payload, dict):
        raise GeminiServiceError("Gemini returned invalid student-guidance JSON.")
    return payload


def _clean_text(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise GeminiServiceError(f"Gemini returned an invalid {field_name}.")
    return re.sub(r"\s+", " ", value).strip()


def _parse_techniques(
    value: Any,
    *,
    signals: list[str],
) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not 1 <= len(value) <= 2:
        raise GeminiServiceError("Gemini returned invalid study techniques.")

    allowed_signals_by_key = {
        " ".join(str(signal).split()).casefold(): " ".join(str(signal).split())
        for signal in signals
        if str(signal).strip()
    }
    selected: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            raise GeminiServiceError("Gemini returned unstructured study-technique evidence.")

        normalized = str(item.get("name") or "").strip().lower()
        if normalized not in TECHNIQUES or any(row["technique"] == normalized for row in selected):
            raise GeminiServiceError("Gemini selected a technique outside the allowed catalogue.")

        reason = _clean_text(item.get("reason"), "study-technique reason")
        if len(reason) < 20:
            raise GeminiServiceError("Gemini returned an incomplete study-technique reason.")

        raw_matched_signals = item.get("matched_signals")
        if not isinstance(raw_matched_signals, list):
            raise GeminiServiceError("Gemini returned invalid matched study-technique signals.")
        matched_signals: list[str] = []
        for signal in raw_matched_signals:
            key = " ".join(str(signal).split()).casefold()
            if key not in allowed_signals_by_key:
                raise GeminiServiceError("Gemini invented a study-technique signal.")
            canonical_signal = allowed_signals_by_key[key]
            if canonical_signal not in matched_signals:
                matched_signals.append(canonical_signal)
        if allowed_signals_by_key and not matched_signals:
            raise GeminiServiceError("Gemini omitted the matched study-technique signals.")

        selected.append(
            {
                "technique": normalized,
                **TECHNIQUES[normalized],
                "selection_reason": reason,
                "matched_signals": matched_signals,
                "selection_method": "constrained gemini",
            }
        )
    return selected


def _parse_recommendations(value: Any) -> list[str]:
    if not isinstance(value, list) or len(value) != 4:
        raise GeminiServiceError("Gemini must return exactly four lecture recommendations.")

    recommendations = []
    for item in value:
        cleaned = _clean_text(item, "lecture recommendation")
        cleaned = re.sub(r"^[\s\d).:-]+", "", cleaned)
        cleaned = re.sub(r"^jot down\b", "Write down", cleaned, flags=re.IGNORECASE)
        if len(cleaned) < 8:
            raise GeminiServiceError("Gemini returned an invalid lecture recommendation.")
        recommendations.append(cleaned)
    return recommendations


def generate_student_guidance(
    *,
    student_id: str,
    lesson_id: str,
    predicted_label: str,
    signals: list[str],
    human_signals: list[str],
) -> dict[str, Any]:
    technique_catalogue = [
        {
            "name": name,
            "title": details["title"],
            "description": details["description"],
            "best_for": details["best_for"],
        }
        for name, details in TECHNIQUES.items()
    ]
    prompt = USER_PROMPT_TEMPLATE.format(
        student_id=student_id,
        lesson_id=lesson_id,
        predicted_label=predicted_label,
        signals_text="\n".join(f"- {signal}" for signal in signals) or "- none detected",
        human_signals_text=(
            "\n".join(f"- {signal}" for signal in human_signals)
            or "- no strong behavioral signal was detected"
        ),
        technique_catalogue_json=json.dumps(technique_catalogue, ensure_ascii=False, indent=2),
    )
    response = generate_gemini_text(
        SYSTEM_PROMPT,
        prompt,
        response_mime_type="application/json",
        temperature=TECHNIQUE_TEMPERATURE,
        max_output_tokens=GUIDANCE_MAX_OUTPUT_TOKENS,
    )
    payload = _parse_json_object(response)
    explanation = _clean_text(payload.get("teacher_explanation"), "teacher explanation")
    recommendations = _parse_recommendations(payload.get("lecture_recommendations"))

    techniques = _parse_techniques(
        payload.get("study_techniques"),
        signals=signals,
    )

    return {
        "human_explanation": explanation,
        "study_technique": {
            "techniques": techniques,
            "source": "constrained gemini",
            "guidance_version": GUIDANCE_VERSION,
            "selection_evidence": {
                "selection_method": "constrained gemini",
                "allowed_techniques": [details["title"] for details in TECHNIQUES.values()],
                "model_name": settings.GEMINI_MODEL,
                "prompt_version": TECHNIQUE_PROMPT_VERSION,
                "temperature": TECHNIQUE_TEMPERATURE,
                "max_output_tokens": GUIDANCE_MAX_OUTPUT_TOKENS,
            },
            "teacher_review": {
                "status": "pending",
                "reviewed_at": None,
                "rejection_reason": None,
                "regeneration_count": 0,
            },
            "student_feedback": {},
        },
        "lecture_support": {
            "strategies": "\n".join(
                f"{index + 1}) {recommendation}"
                for index, recommendation in enumerate(recommendations)
            ),
            "source": "gemini",
            "guidance_version": GUIDANCE_VERSION,
        },
    }
