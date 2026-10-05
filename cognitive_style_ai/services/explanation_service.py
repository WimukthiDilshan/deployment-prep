from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np
import shap
from lime.lime_tabular import LimeTabularExplainer

from services.model_client import BatchPredictor


def build_background(target: np.ndarray, history: list[dict], feature_names: list[str]) -> np.ndarray:
    rows = []
    for item in history[-100:]:
        try:
            rows.append([float(item[name]) for name in feature_names])
        except (KeyError, TypeError, ValueError):
            continue
    rng = np.random.default_rng(42)
    synthetic = np.empty((100, len(target)), dtype=float)
    for index, name in enumerate(feature_names):
        if name == "FirstInteractionPreference_VISUAL":
            synthetic[:, index] = rng.integers(0, 2, size=100)
        elif "ratio" in name.lower():
            synthetic[:, index] = rng.uniform(0.0, 1.0, size=100)
        else:
            scale = max(abs(float(target[index])) * 0.25, 0.1)
            synthetic[:, index] = target[index] + rng.normal(0.0, scale, size=100)

    matrices = [target.reshape(1, -1), synthetic]
    if rows:
        matrices.append(np.asarray(rows, dtype=float))
    return np.vstack(matrices)


def _lime(target, background, feature_names, predictor, target_index, num_samples):
    explainer = LimeTabularExplainer(
        background,
        feature_names=feature_names,
        class_names=predictor.classes,
        mode="classification",
        discretize_continuous=False,
        random_state=42,
    )
    explanation = explainer.explain_instance(
        target,
        predictor.probabilities,
        labels=(target_index,),
        num_features=len(feature_names),
        num_samples=max(50, num_samples),
    )
    weights = dict(explanation.local_exp[target_index])
    return [
        {"feature": feature, "value": float(target[index]), "weight": float(weights.get(index, 0.0))}
        for index, feature in enumerate(feature_names)
    ]


def _shap(target, background, feature_names, predictor, target_index, num_samples):
    prediction = lambda matrix: predictor.probabilities(matrix)[:, target_index]
    explainer = shap.KernelExplainer(prediction, shap.kmeans(background, min(10, len(background))))
    values = np.asarray(
        explainer.shap_values(target.reshape(1, -1), nsamples=max(25, num_samples)),
        dtype=float,
    ).reshape(-1)
    return [
        {"feature": feature, "value": float(target[index]), "shap_value": float(values[index])}
        for index, feature in enumerate(feature_names)
    ]


def aggregate_top_features(lime_output: list[dict], shap_output: list[dict], limit: int = 3) -> list[dict]:
    lime_total = sum(abs(item["weight"]) for item in lime_output) or 1.0
    shap_total = sum(abs(item["shap_value"]) for item in shap_output) or 1.0
    lime_map = {item["feature"]: item for item in lime_output}
    shap_map = {item["feature"]: item for item in shap_output}
    combined = []
    for feature in lime_map.keys() | shap_map.keys():
        lime_weight = float(lime_map.get(feature, {}).get("weight", 0.0))
        shap_value = float(shap_map.get(feature, {}).get("shap_value", 0.0))
        lime_importance = abs(lime_weight) / lime_total
        shap_importance = abs(shap_value) / shap_total
        signed_score = ((lime_weight / lime_total) + (shap_value / shap_total)) / 2.0
        combined.append({
            "feature": feature,
            "feature_value": float((lime_map.get(feature) or shap_map[feature])["value"]),
            "lime_weight": lime_weight,
            "shap_value": shap_value,
            "importance": (lime_importance + shap_importance) / 2.0,
            "direction": "positive" if signed_score > 0 else "negative" if signed_score < 0 else "neutral",
        })
    return sorted(combined, key=lambda item: item["importance"], reverse=True)[:limit]


def explain_in_parallel(
    features: dict[str, float],
    feature_names: list[str],
    classes: list[str],
    cognitive_style: str,
    history: list[dict],
    lime_samples: int,
    shap_samples: int,
) -> tuple[list[dict], list[dict], list[dict]]:
    target = np.asarray([float(features.get(name, 0.0)) for name in feature_names], dtype=float)
    background = build_background(target, history, feature_names)
    target_index = classes.index(cognitive_style) if cognitive_style in classes else 0

    with ThreadPoolExecutor(max_workers=2) as executor:
        lime_future = executor.submit(
            _lime, target, background, feature_names, BatchPredictor(feature_names, classes), target_index, lime_samples
        )
        shap_future = executor.submit(
            _shap, target, background, feature_names, BatchPredictor(feature_names, classes), target_index, shap_samples
        )
        lime_output = lime_future.result()
        shap_output = shap_future.result()
    return lime_output, shap_output, aggregate_top_features(lime_output, shap_output)
