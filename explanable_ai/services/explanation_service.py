from __future__ import annotations

from collections.abc import Mapping, Sequence

from fastapi import HTTPException

from models.explanation_models import ExplainRequest, ExplainResponse, ExplanationFactor
from services.gpt_client import generate_gpt_text, has_gpt_api_key
from services.shap_lime_engine import compute_shap_and_lime


def _top_feature_names(factors: list[ExplanationFactor]) -> list[str]:
    return [factor.feature for factor in factors]


def _resolve_agreed_top_factors(
    shap_top_factors: list[ExplanationFactor],
    lime_top_factors: list[ExplanationFactor],
) -> list[ExplanationFactor]:
    # Overlap means both methods point to the same feature, which is safer to show first.
    agreed_features = set(_top_feature_names(shap_top_factors)) & set(_top_feature_names(lime_top_factors))
    if not agreed_features:
        # Fallback: if no overlap exists, still return a small stable list for the UI.
        return shap_top_factors[:2] if shap_top_factors else lime_top_factors[:2]

    overlap_candidates = [factor for factor in shap_top_factors if factor.feature in agreed_features]
    return sorted(overlap_candidates, key=lambda factor: abs(factor.score), reverse=True)[:3]


def _build_gpt_explanation_text(
    final_cognitive_load: str,
    factors: list[ExplanationFactor],
) -> str:
    factor_lines = "\n".join(
        f"- {factor.feature}: score={factor.score}, impact={factor.impact}, value={factor.value}"
        for factor in factors[:5]
    ) or "- No strong factors available"

    system_prompt = (
        "You are an educational AI assistant that writes concise, actionable explanations "
        "for teachers based on student cognitive load signals."
    )
    user_prompt = (
        f"Student final cognitive load: {final_cognitive_load}\n"
        f"Top factors:\n{factor_lines}\n\n"
        "Write a short explanation (2-3 sentences) focused on why this load classification likely occurred."
    )

    # Real GPT generation is integrated here.
    return generate_gpt_text(system_prompt, user_prompt, temperature=0.2)


def _build_gpt_recommendation_text(
    final_cognitive_load: str,
    factors: list[ExplanationFactor],
) -> str:
    factor_lines = "\n".join(
        f"- {factor.feature}: score={factor.score}, impact={factor.impact}, value={factor.value}"
        for factor in factors[:5]
    ) or "- No strong factors available"

    system_prompt = (
        "You are an instructional design assistant. Provide practical next-step recommendations "
        "for a teacher based on cognitive load evidence."
    )
    user_prompt = (
        f"Student final cognitive load: {final_cognitive_load}\n"
        f"Top factors:\n{factor_lines}\n\n"
        "Provide one concise recommendation paragraph for the next lesson."
    )

    # Real GPT recommendation generation is integrated here.
    return generate_gpt_text(system_prompt, user_prompt, temperature=0.2)


def _build_deterministic_explanation_text(final_cognitive_load: str, factors: list[ExplanationFactor]) -> str:
    if not factors:
        return f"The learner shows a {final_cognitive_load.lower()} cognitive load profile with limited evidence from the current summary."

    top_features = ", ".join(factor.feature for factor in factors[:3])
    return (
        f"The learner is classified as {final_cognitive_load} based on the summary profile. "
        f"The strongest contributing signals are {top_features}."
    )


def _build_deterministic_recommendation_text(final_cognitive_load: str, factors: list[ExplanationFactor]) -> str:
    if not factors:
        return "Collect more interaction data and re-evaluate the learner profile before making instructional changes."

    factor_reasons = "; ".join(factor.reason for factor in factors[:2])
    if final_cognitive_load in {"High", "Very High"}:
        return (
            f"Prioritize simpler content, shorter segments, and immediate feedback. {factor_reasons}"
        )
    if final_cognitive_load == "Medium":
        return f"Maintain the current pace but add small scaffolds and confidence checks. {factor_reasons}"
    return f"Keep the experience concise and monitor for changes in effort or confusion. {factor_reasons}"


def _build_explanation_text(final_cognitive_load: str, factors: list[ExplanationFactor]) -> str:
    # Prefer LLM text when configured, then fall back to deterministic wording.
    if has_gpt_api_key():
        try:
            text = _build_gpt_explanation_text(final_cognitive_load, factors)
            if text:
                return text
        except Exception:
            pass
    return _build_deterministic_explanation_text(final_cognitive_load, factors)


def _build_recommendation_text(final_cognitive_load: str, factors: list[ExplanationFactor]) -> str:
    # Prefer LLM text when configured, then fall back to deterministic wording.
    if has_gpt_api_key():
        try:
            text = _build_gpt_recommendation_text(final_cognitive_load, factors)
            if text:
                return text
        except Exception:
            pass
    return _build_deterministic_recommendation_text(final_cognitive_load, factors)


def build_explanation(
    request: ExplainRequest,
    background_rows: Sequence[Mapping[str, object]] | None = None,
) -> ExplainResponse:
    """Build SHAP/LIME output locally using the remote model API as the black-box predictor."""
    try:
        # SHAP and LIME run in this project, but model predictions come from teammate API.
        shap_factors, lime_factors, predicted_label = compute_shap_and_lime(
            feature_values=request.summary.averages.model_dump(),
            background_rows=background_rows,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "success": False,
                "message": "Explainability computation failed.",
                "data": None,
                "errors": [str(exc)],
            },
        ) from exc

    agreed_top_factors = _resolve_agreed_top_factors(shap_factors, lime_factors)
    target_label = predicted_label or request.final_cognitive_load

    explanation_text = _build_explanation_text(target_label, agreed_top_factors or shap_factors)
    recommendation_text = _build_recommendation_text(target_label, agreed_top_factors or shap_factors)

    return ExplainResponse(
        shap_top_factors=shap_factors,
        lime_top_factors=lime_factors,
        agreed_top_factors=agreed_top_factors,
        explanation_text=explanation_text,
        recommendation_text=recommendation_text,
    )
