# SHAP AI Service

This service generates SHAP explanations for saved cognitive-load predictions.
Both SHAP perturbations and calls to the cognitive-load model use its current
six video/content features only.

The service loads the existing trained model read-only from
`../COGNITIVE-LOAD-API/model/cognitive_load_model.pkl`, evaluates perturbed
rows locally in batches, and summarizes the Kernel SHAP background to at most
10 representative rows. The cognitive-load API is not modified.

## Endpoints
- `GET /api/v1/health`
- `GET /api/v1/lessons`

SHAP explanations use `100` samples by default, matching the cognitive-style
SHAP analysis. The `num_samples` query parameter can override this value.
- `GET /api/v1/lessons/{lesson_id}/students`
- `GET /api/v1/lessons/{lesson_id}/predictions`
- `GET /api/v1/lessons/{lesson_id}/predictions/{prediction_id}/shap`

## Environment
Use the same prediction database as `lime_ai` by default:
- `DB_NAME=lime-data`
- `MODEL_API_URL=http://127.0.0.1:8021`
