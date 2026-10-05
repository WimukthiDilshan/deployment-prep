from services.gemini_client import generate_gemini_text


SYSTEM_PROMPT = (
    "You are an expert educational assistant reporting a student's cognitive-load result to their "
    "teacher. Explain the result in natural, clear, professional, third-person language so a human "
    "reader immediately understands what happened during the lesson. "
    "Never mention LIME, SHAP, features, drivers, signals, pressure, relief, or model analysis."
)

USER_PROMPT_TEMPLATE = (
    "Write one short paragraph for the teacher about the student.\n"
    "Student ID: {student_id}\n"
    "Lesson ID: {lesson_id}\n"
    "Predicted cognitive load: {predicted_label}\n"
    "Three most important observed behaviors:\n{signals_text}\n\n"
    "Start exactly with: This student has {predicted_label} cognitive load because\n"
    "Turn the behaviors into one connected, human-readable explanation. "
    "Use plain language, connect cause and effect carefully, and do not invent facts. "
    "Describe increased-load behaviors as reasons for the result. If a behavior is marked "
    "as reducing load, describe it naturally as something that helped the student cope. "
    "Explain only why the student received this result. Do not address the student as 'you'. "
    "Do not give advice, study techniques, actions, or recommendations; those are provided separately. "
    "Do not repeat the behavior labels, technical terminology, numbers, percentages, formulas, "
    "raw feature names, or the student and lesson IDs. Use 45-80 words."
)


def generate_human_explanation(
    *, student_id: str, lesson_id: str, predicted_label: str, signals: list[str]
) -> str:
    signals_text = "\n".join(f"- {signal}" for signal in signals)
    prompt = USER_PROMPT_TEMPLATE.format(
        student_id=student_id,
        lesson_id=lesson_id,
        predicted_label=predicted_label,
        signals_text=signals_text or "- no strong behavioral signal was detected",
    )
    return generate_gemini_text(SYSTEM_PROMPT, prompt)
