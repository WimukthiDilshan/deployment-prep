# Cognitive Load API Connection to LIME AI and SHAP AI

## Purpose

This document is only for the person rebuilding `cognitive-load-api`.

The LIME AI and SHAP AI services are already built. The rebuilt Cognitive Load API must support these two connections:

1. After every completed two-minute student window, Cognitive Load API sends the feature data to LIME AI. LIME AI calls the Cognitive Load API model, receives the prediction, and saves the complete result in the LIME AI database table.
2. When the teacher clicks **Raw Analyse**, LIME AI and SHAP AI call the Cognitive Load API many times to explain the model prediction.

## Correct service names

| Service | Project directory | Local URL |
|---|---|---|
| Cognitive Load API | `COGNITIVE-LOAD-API` | `http://127.0.0.1:8021` |
| LIME AI | `lime_ai` | `http://127.0.0.1:8110` |
| SHAP AI | `sharp_ai` | `http://127.0.0.1:8111` |

The existing directory is named `sharp_ai`, but the service is **SHAP AI**, not SHARP AI.

## Required connection flow

```text
Student activity
      |
      | collect one completed 2-minute feature window
      v
Cognitive Load API
      |
      | POST http://127.0.0.1:8110/api/v1/predict
      v
LIME AI
      |
      | POST http://127.0.0.1:8021/predict
      v
Cognitive Load model prediction
      |
      v
LIME AI saves features + prediction
in `lime-data`.`cognitive-load`

Later, teacher clicks Raw Analyse
      |
      +--> LIME AI calls Cognitive Load API /predict many times
      |
      +--> SHAP AI calls Cognitive Load API /predict many times
      |
      v
LIME and SHAP explanations are displayed
```

The Cognitive Load API does not send every two-minute window directly to SHAP AI. It sends the window only to LIME AI. SHAP AI reads the prediction data saved by LIME AI and calls the Cognitive Load API only when Raw Analyse runs.

## Part 1: Send every completed two-minute window to LIME AI

After extracting one complete 120-second feature window, Cognitive Load API must call:

```http
POST http://127.0.0.1:8110/api/v1/predict
Content-Type: application/json
```

Use an environment variable so the URL is not hard-coded:

```env
LIME_PREDICT_URL=http://127.0.0.1:8110/api/v1/predict
```

Send this exact JSON structure:

```json
{
  "student_id": "student-1",
  "lesson_id": "lesson-1",
  "session_id": "video-session-123",
  "minute_index": 1,
  "window_start": "2026-07-14T10:00:00",
  "window_end": "2026-07-14T10:02:00",
  "pause_frequency": 2,
  "navigation_count_video": 1,
  "rewatch_segments": 1,
  "playback_rate_change": 0,
  "idle_duration_video": 10,
  "time_on_content": 110,
  "navigation_count_adaptation": 1,
  "revisit_frequency": 0,
  "idle_duration_adaptation": 0,
  "quiz_response_time": 20,
  "error_rate": 0.25
}
```

### Required feature names

Do not rename these 11 fields:

1. `pause_frequency`
2. `navigation_count_video`
3. `rewatch_segments`
4. `playback_rate_change`
5. `idle_duration_video`
6. `time_on_content`
7. `navigation_count_adaptation`
8. `revisit_frequency`
9. `idle_duration_adaptation`
10. `quiz_response_time`
11. `error_rate`

`student_id`, `lesson_id`, and `session_id` identify the learner window. Despite its existing name, `minute_index` is the sequential **two-minute window number**: `1`, `2`, `3`, and so on.

### What LIME AI does with the request

The Cognitive Load API does not have to insert anything into the LIME database.

When LIME AI receives `/api/v1/predict`, it automatically:

1. Sends the same feature payload to Cognitive Load API `POST /predict`.
2. Receives the cognitive-load prediction.
3. Saves the identifiers, window times, all 11 features, prediction label, score, and confidence in MySQL table ``lime-data`.`cognitive-load```.

A successful LIME response has this general shape:

```json
{
  "success": true,
  "message": "Prediction stored successfully.",
  "data": {
    "id": 1,
    "student_id": "student-1",
    "lesson_id": "lesson-1",
    "predicted_cognitive_load": "High",
    "predicted_score": 4,
    "confidence": 0.87
  },
  "errors": []
}
```

Only mark a two-minute window as successfully delivered after LIME AI returns HTTP `2xx`. Save a dispatch status or use a unique window key so the same window is not inserted repeatedly. A suitable identity is:

```text
student_id + lesson_id + session_id + minute_index
```

If LIME AI is temporarily unavailable, keep the completed window and retry it later.

## Part 2: Provide the model endpoint used by LIME AI and SHAP AI

The rebuilt Cognitive Load API must provide:

```http
POST http://127.0.0.1:8021/predict
Content-Type: application/json
```

Both LIME AI and SHAP AI are configured with:

```env
MODEL_API_URL=http://127.0.0.1:8021
MODEL_API_PREDICT_PATH=/predict
MODEL_API_TIMEOUT_SECONDS=30
```

The endpoint must accept the same identity fields, window fields, and 11 features shown above.

It must return these exact preferred response fields:

```json
{
  "predicted_cognitive_load": "High",
  "predicted_score": 4,
  "confidence": 0.87
}
```

The response may also be wrapped inside `data` or `result`, but the simplest response is the direct JSON object above.

Use these labels and scores consistently:

| Score | Label |
|---:|---|
| 1 | `Very Low` |
| 2 | `Low` |
| 3 | `Medium` |
| 4 | `High` |
| 5 | `Very High` |

### Important requirement for Raw Analyse

LIME and SHAP explain the model as a black box. During one Raw Analyse request, they create many modified versions of the 11 features and call `POST /predict` repeatedly. LIME and SHAP can run at the same time.

Therefore, Cognitive Load API `/predict` must:

- accept repeated and concurrent requests;
- return quickly enough for the 30-second per-request timeout;
- calculate predictions from the received feature values;
- not require that every modified sample already exists in the database;
- keep the same feature names, feature meaning, model preprocessing, labels, and scoring for every call.

Prefer making `/predict` an inference-only endpoint. LIME and SHAP test artificial feature samples, so saving every Raw Analyse call as a real student record would pollute the database. The real two-minute student result is already saved by LIME AI in ``lime-data`.`cognitive-load```.

## Part 3: How Raw Analyse uses the Cognitive Load API

The Cognitive Load API developer does not need to build the Raw Analyse frontend or the explanation algorithms. They already exist.

The existing sequence is:

1. LIME AI stores all two-minute prediction rows in ``lime-data`.`cognitive-load```.
2. The teacher selects a lesson and student.
3. LIME AI creates one aggregate record in ``lime-data`.`student-lesson-summary```.
4. The teacher clicks **Raw Analyse**.
5. The frontend calls LIME AI and SHAP AI in parallel.
6. LIME AI perturbs the summary features and repeatedly calls Cognitive Load API `/predict`.
7. SHAP AI perturbs the same summary features and repeatedly calls Cognitive Load API `/predict`.
8. Both services return their explanation values to the frontend.

No additional endpoint is required in Cognitive Load API for Raw Analyse. Both services use the same `POST /predict` endpoint.

## Minimal Cognitive Load API implementation checklist

- [ ] Run Cognitive Load API at `http://127.0.0.1:8021`.
- [ ] Provide `POST /predict`.
- [ ] Accept all identity/window fields and the exact 11 feature names.
- [ ] Return `predicted_cognitive_load`, `predicted_score`, and `confidence`.
- [ ] Use the five agreed prediction labels and scores.
- [ ] Build a feature window for every completed 120 seconds.
- [ ] POST each completed window to LIME AI `/api/v1/predict`.
- [ ] Do not send the two-minute window directly to SHAP AI.
- [ ] Prevent duplicate delivery of the same student/session/window.
- [ ] Retry failed LIME deliveries.
- [ ] Allow repeated concurrent `/predict` calls from LIME and SHAP.
- [ ] Avoid saving artificial LIME/SHAP samples as real student data.

## Quick connection test

First check the three services:

```text
GET http://127.0.0.1:8021/health
GET http://127.0.0.1:8110/api/v1/health
GET http://127.0.0.1:8111/api/v1/health
```

Then POST one sample feature window to:

```text
http://127.0.0.1:8110/api/v1/predict
```

The connection is correct when:

1. LIME AI successfully calls Cognitive Load API `/predict`.
2. A new row appears in ``lime-data`.`cognitive-load```.
3. The stored row contains the same student, lesson, session, window, and 11 feature values.
4. The row contains `predicted_cognitive_load`, `predicted_score`, and `confidence`.
5. Raw Analyse can receive both LIME and SHAP outputs without a model connection error.

## Existing reference files

The Cognitive Load API developer mainly needs to compare these files:

- `COGNITIVE-LOAD-API/app/services/lime_dispatch_service.py` - sends each completed two-minute window to LIME AI.
- `COGNITIVE-LOAD-API/app/schemas/prediction.py` - exact input contract.
- `COGNITIVE-LOAD-API/app/api/routes.py` - `/predict` and raw-event routes.
- `lime_ai/services/model_client.py` - how LIME AI calls Cognitive Load API.
- `sharp_ai/services/model_client.py` - how SHAP AI calls Cognitive Load API.
- `lime_ai/services/prediction_service.py` - LIME prediction storage and Raw Analyse model calls.
- `sharp_ai/services/shap_service.py` - SHAP Raw Analyse model calls.
