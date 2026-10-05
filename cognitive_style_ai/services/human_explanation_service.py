from services.gemini_client import generate_gemini_text


EXPLANATION_PROMPT_VERSION = "teacher-friendly-v4-three-class"


def get_cognitive_style_display_name(cognitive_style: str) -> str:
    normalized = str(cognitive_style or "").strip().lower().replace("-", "/")
    if normalized in {
        "moderate/intermediatory",
        "moderate/intermediate",
        "intermediatory",
        "intermediate",
        "moderate",
    }:
        return "Intermediate"
    return str(cognitive_style or "Unknown").strip().title()


FEATURE_DESCRIPTIONS = {
    "imageCursorRatio": "how strongly cursor activity was concentrated on images and visual content",
    "imageScrollRatio": "how strongly scrolling activity was concentrated on images and visual content",
    "ImageGazeRatio": "how much viewing time was directed toward images and visual content",
    "FirstInteractionPreference_VISUAL": "whether the learner interacted with visual content before text",
}

SYSTEM_PROMPT = (
    "You are an educational assistant explaining a learner's Visual, Verbal, or Intermediate cognitive style to a "
    "teacher who has no technical or data-science knowledge. Use familiar classroom language and "
    "explain what the learner's observed actions mean, rather than merely naming those actions. Base "
    "every statement only on the supplied observations and use cautious wording such as 'suggests' or "
    "'may indicate'. Do not mention LIME, SHAP, algorithms, models, features, signals, weights, scores, "
    "confidence, formulas, IDs, raw field names, or analysis terminology. Do not diagnose the learner "
    "or describe the cognitive style as a permanent trait. Explain only why the learner received the "
    "reported style. Do not provide advice, recommendations, teaching actions, or study strategies."
)


def build_explanation_prompt(
    *, student_id: str, lesson_id: str, cognitive_style: str, confidence: float, top_features: list[dict]
) -> str:
    display_style = get_cognitive_style_display_name(cognitive_style)
    opening = (
        "This student shows an intermediate cognitive style because"
        if display_style == "Intermediate"
        else f"This student shows a predominantly {display_style.lower()} cognitive style because"
    )
    observations = []
    for rank, feature in enumerate(top_features, start=1):
        description = FEATURE_DESCRIPTIONS.get(feature["feature"], feature["feature"])
        effect = (
            f"supports the {display_style} result"
            if feature.get("direction") == "positive"
            else f"slightly opposes the {display_style} result"
            if feature.get("direction") == "negative"
            else "has no clear directional effect"
        )
        observations.append(f"{rank}. {description}; this observation {effect}.")

    return (
        f"Prompt version: {EXPLANATION_PROMPT_VERSION} (internal only; do not repeat).\n"
        "Write one coherent paragraph of 65-100 words for a non-technical teacher.\n"
        f"Student ID (context only; do not repeat): {student_id}\n"
        f"Lesson ID (context only; do not repeat): {lesson_id}\n"
        f"Predicted cognitive style: {display_style}\n"
        f"Prediction confidence: {confidence:.4f}\n"
        "Most influential observed behaviors:\n"
        + "\n".join(observations)
        + f"\nStart exactly with: {opening}\n"
        "Explain the result as a connected account of what the learner did and what that pattern may mean "
        "for how they engaged with this lesson. Translate every observation into everyday language, do not "
        "list or repeat technical labels, and do not include numerical values. Explain only why this style was "
        "selected; do not tell the teacher or student what to do next. For an Intermediate result, explain "
        "the observed balance between visual and text-based engagement without presenting it as uncertainty.\n"
        "Style example only (do not copy facts from it): This student shows a predominantly visual cognitive "
        "style because their attention stayed mainly on diagrams and other visual material while working "
        "through the lesson. They also tended to explore visual content before relying on written text, which "
        "suggests that pictures helped them organize and understand the information. This is a preference "
        "observed in this lesson, not a fixed ability, and the combined pattern is why the visual result was selected."
    )


def generate_human_explanation(
    *, student_id: str, lesson_id: str, cognitive_style: str, confidence: float, top_features: list[dict]
) -> tuple[str, str, str]:
    prompt = build_explanation_prompt(
        student_id=student_id,
        lesson_id=lesson_id,
        cognitive_style=cognitive_style,
        confidence=confidence,
        top_features=top_features,
    )
    explanation, model = generate_gemini_text(SYSTEM_PROMPT, prompt)
    return prompt, explanation, model
