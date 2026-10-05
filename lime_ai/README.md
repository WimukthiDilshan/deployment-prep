# LIME AI Service

This service receives cognitive-load feature payloads, calls the model API, and automatically saves the prediction to MySQL.

LIME explanations load the same trained model read-only from
`../COGNITIVE-LOAD-API/model/cognitive_load_model.pkl` and predict all
perturbations locally as a batch. Normal prediction ingestion still uses the
existing cognitive-load API. The cognitive-load API itself is not modified.

## What it stores

- `student_id`
- `lesson_id`
- `session_id`
- `minute_index`
- the six model feature values: `pause_frequency`, `navigation_count_video`,
  `rewatch_segments`, `playback_rate_change`, `idle_duration_video`, and
  `time_on_content`
- predicted cognitive load label
- predicted score
- confidence
- timestamp

## Database

The service is configured to use a MySQL database named `lime-data` and a table named `cognitive-load`.

## Run

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.

2. Install dependencies:

```bash
pip install -r requirements.txt
```

5. Start the service:

```bash
uvicorn main:app --host 0.0.0.0 --port 8110
```

On startup, the service creates the `lime-data` database if it does not exist and then creates the `cognitive-load` table automatically.

Successful aggregate analysis also creates or updates one
`student-lesson-top-signals` row per student and lesson. The row stores the
three strongest combined LIME/SHAP signal names, their raw values, normalized
values, the predicted cognitive-load level, and the summary prediction ID that
produced them.

If you prefer manual setup, you can still run [db/init.sql](db/init.sql).

## API

- `POST /api/v1/predict` - predicts cognitive load and saves the record automatically
- `GET /api/v1/predictions` - returns saved rows
- `GET /api/v1/health` - health check
- `POST /api/v1/aggregate-explanation` - uses Gemini to
  generate a human explanation, lecture support, and personalized study-technique suggestions
- `POST /api/v1/lessons/{lesson_id}/students/{student_id}/share-guidance` - approves and shares guidance
- `POST /api/v1/lessons/{lesson_id}/students/{student_id}/reject-guidance` - records teacher rejection
- `POST /api/v1/lessons/{lesson_id}/students/{student_id}/regenerate-guidance` - generates a new pending review
- `POST /api/v1/students/{student_id}/lessons/{lesson_id}/technique-feedback` - saves student usage and ratings

The aggregate response keeps two audiences separate. The default teacher-friendly explanation
uses non-technical language to explain only why the cognitive-load level was selected. Confidence,
combined signal values, and raw LIME/SHAP evidence are displayed only under the frontend's
`View Technical Evidence` control. Opening that control does not make another Gemini request.

Each recommended study technique also includes an in-app learner guide: what the technique is,
what it is best for, an estimated completion time, setup steps for the linked third-party tool,
an account/sign-in notice, and a paper-based alternative. These guide details are static metadata,
so they are also attached to previously cached recommendations without another Gemini request.

Technique selection uses a constrained human-in-the-loop flow. Gemini may select one or two items
only from the fixed five-item catalogue and must return a reason plus exact observed behaviours.
The backend rejects unknown techniques and invented behaviours. Guidance starts in `pending` state:
a teacher can approve and share it, reject it with a reason, or regenerate it. Approved students can
record whether they used each technique, helpfulness and ease ratings, and an optional comment.
Teacher decisions, student feedback, model name, prompt version, and temperature are stored inside
the existing `study_technique` JSON field for research auditing; no arbitrary suitability score is used.
