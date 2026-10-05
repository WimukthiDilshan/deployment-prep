# Cognitive Style Explainability Service

This FastAPI service automatically synchronizes model-ready cognitive-style inputs from CognitiveStyleBackend's MongoDB into MySQL. When Analyse Style is requested, it predicts the cognitive style, runs LIME and SHAP concurrently, normalizes and combines their contributions, and updates the same row with the prediction and top three features.

The MongoDB `userId` becomes both `student_id` and `session_id`. Cognitive style is treated as a student-level profile. CognitiveStyleBackend does not store a lesson ID, so the lesson selected during the student's first analysis is retained only as creation context; later lessons reuse the same completed profile.

## Setup

1. Start MongoDB and MySQL.
2. Copy `.env.example` to `.env` and update database credentials if needed.
3. Start the unchanged `CognitiveStyleBackend` on port `8003`.
4. Install this service's dependencies and start it on port `8112`:

   ```powershell
   python -m pip install -r requirements.txt
   python -m uvicorn main:app --host 127.0.0.1 --port 8112 --reload
   ```

5. Set `COGNITIVE_STYLE_AI_URL=http://localhost:8112` in `api-gateway/.env` and start the gateway.

The service creates the `cognitive-style-explanations` database and `cognitive-style-analysis` table automatically. The equivalent SQL is in `db/init.sql`.

## Data lifecycle

1. CognitiveStyleBackend saves cursor and gaze summaries to MongoDB.
2. The background synchronizer checks MongoDB every two seconds and creates or refreshes one pending MySQL row per student containing the latest four model inputs. It stops creating inputs after that student has a completed profile.
3. `POST .../analyse` finds that student's latest pending row and assigns the selected lesson.
4. The saved values are passed to the Visual/Verbal/Intermediate model.
5. The top three are translated into non-technical classroom language and sent to the configured Gemini model to explain only why the reported cognitive style was selected, without recommendations or teaching actions.
6. Prediction, confidence, LIME output, SHAP output, top three, prompt, and human-readable explanation are written to that same row with status `completed`.

The frontend shows the teacher-friendly explanation by default. Prediction confidence,
combined feature importance, and raw LIME/SHAP values remain available under the separate
`View Technical Evidence` control and do not require another Gemini request.

A completed student profile is reused across lessons while its saved model signature matches the currently loaded model and label encoder. After a model upgrade, the existing feature snapshot is automatically re-analysed and the stale result is replaced. New MongoDB interaction documents do not create repeated analyses after the student profile is complete.

If Gemini is unavailable, the request returns HTTP 503 and the row remains `pending`, allowing the teacher to retry without losing the synchronized model input.

The default Gemini model is `gemini-3.5-flash-lite`. The exact model that generated each explanation is stored in `explanation_model`.

## API

- `POST /api/v1/lessons/{lesson_id}/students/{student_id}/analyse`
- `GET /api/v1/lessons/{lesson_id}/students/{student_id}/latest`
- `GET /api/v1/health`

Optional analysis query parameters are `lime_samples` (default `200`) and `shap_samples` (default `100`).

The model is `CognitiveStyleBackend/aiModel2/cognitive_style_rf_model.pkl`, with its `label_encoder.pkl`. It predicts `Visual`, `Verbal`, or `Moderate/Intermediatory` from `imageCursorRatio`, `imageScrollRatio`, `ImageGazeRatio`, and `FirstInteractionPreference_VISUAL`. The raw third-class label is shown to teachers as `Intermediate`. The service reads these files without modifying CognitiveStyleBackend. Set `COGNITIVE_STYLE_MODEL_PATH` and `COGNITIVE_STYLE_LABEL_ENCODER_PATH` to override their locations.
