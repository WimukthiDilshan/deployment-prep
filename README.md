<<<<<<< HEAD
# Cognitive Load Learning Platform

This repository contains a multi-service learning analytics platform for course delivery, cognitive-load prediction, cognitive-style tracking, explainable AI, and teacher-facing recommendations.

The root README was prepared after reviewing the current `main` branch and the available local/remote branches:

- `main`
- `Cognitive_Load`
- `origin/add_basic_explainable`
- `origin/add_lime`
- `origin/course_upload`
- `origin/image-gen`
- `origin/image-part-final`
- `origin/met_upload`
- `origin/wimukthi`

## What This Project Does

- Provides teacher and student authentication.
- Lets teachers create courses, sections, subsections, and upload learning resources.
- Extracts lesson content from PDFs, PPT files, and audio/video transcripts.
- Runs a React frontend for dashboards, lesson upload, GPT lesson support, cognitive-style tasks, learner profiles, and analysis views.
- Records raw learner interaction events such as gaze, cursor, pauses, quiz timing, and errors.
- Predicts cognitive load with a trained machine-learning model.
- Stores prediction-ready feature windows and prediction logs.
- Generates LIME and SHAP explanations for cognitive-load predictions.
- Summarizes class and student cognitive-load patterns.
- Produces teacher recommendations for adapting future lesson complexity.
- Supports cognitive-style and learner-profile workflows through a separate FastAPI backend.

## Repository Structure

| Path | Purpose |
| --- | --- |
| `frontend/` | React + Vite web app for teachers and students. |
| `api-gateway/` | Express gateway that exposes one frontend-facing API and proxies to all backend services. |
| `backend/` | Express service for authentication, dashboard data, and lesson metadata. |
| `Resource_upload/` | Express service for course/resource upload, course structure, file handling, transcript extraction, and public course reads. |
| `gpt-service/` | Express service for GPT/chat and prompt-building flows. |
| `recommendation_ai/` | Express service that summarizes one final cognitive-load result per student/lesson, combines each student's latest cognitive-style profile, and generates teacher-reviewed next-lesson recommendations. |
| `COGNITIVE-LOAD-API/` | FastAPI cognitive-load prediction service using the trained model in `model/`. |
| `lime_ai/` | FastAPI service that calls the prediction API, stores prediction rows, and exposes LIME-related prediction endpoints. |
| `sharp_ai/` | FastAPI SHAP explanation service for saved cognitive-load predictions. |
| `explanable_ai/` | FastAPI explainability backend for class, lesson, student summaries, SHAP/LIME explanations, and GPT-generated explanation text. |
| `CognitiveStyleBackend/` | FastAPI backend for visual-verbal, analytic-wholistic, gaze, cursor, question-runner, assist-question, and learner-profile features. |
| `cognitive_style_ai/` | Combined LIME + SHAP service for persisted student cognitive-style explanations and top-three feature aggregation. |
| `report_assets/` | Project report/supporting assets. |
| `_pdf_extracts/` | Local extracted PDF output/artifacts. |

## High-Level Architecture

```text
React frontend
  |
  | VITE_API_GATEWAY_URL, default http://localhost:4000
  v
API Gateway :4000
  |-- /api/auth, /api/dashboard, /api/lessons -> backend :5001
  |-- /api/courses, /api/sections, /files -> Resource_upload :5000
  |-- /api/gpt -> gpt-service :5002
  |-- /api/cognitive-load -> COGNITIVE-LOAD-API
  |-- /api/lime-ai -> lime_ai :8110
  |-- /api/shap-ai -> sharp_ai :8011
  |-- /api/cognitive-style-ai -> cognitive_style_ai :8112
  |-- /api/explainable -> explanable_ai :8000
  |-- /api/recommendation -> recommendation_ai
  |-- /cognitive-style -> CognitiveStyleBackend :8003
```

## Main Technologies

- Frontend: React 19, Vite, React Router, Axios, Recharts, ApexCharts, MediaPipe vision tasks.
- Node services: Express, Mongoose, JWT, Multer, Cloudinary, http-proxy-middleware.
- Python services: FastAPI, Uvicorn, Pydantic, SQLAlchemy, PyMySQL, scikit-learn, SHAP, LIME, pandas, numpy.
- Databases: MongoDB for user/course/content services; MySQL for cognitive-load, explainability, LIME/SHAP, and recommendation data.
- AI integrations: Hugging Face-compatible chat endpoint in `gpt-service`; OpenAI-compatible recommendation/explanation flows where configured.

## Default Local Ports

| Service | Default URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| API Gateway | `http://localhost:4000` |
| Auth/dashboard backend | `http://localhost:5001` |
| Resource upload service | `http://localhost:5000` |
| GPT service | `http://localhost:5002` |
| Recommendation service | `http://localhost:5002` by default, but use a different `PORT` if running with `gpt-service` |
| Explainable AI service | `http://localhost:8000` |
| Cognitive-load prediction API | commonly run on `http://127.0.0.1:8021` from its launcher |
| LIME AI service | `http://localhost:8110` |
| SHAP AI service | `http://localhost:8011` |
| Cognitive style backend | `http://localhost:8003` |
| Cognitive style explainability | `http://localhost:8112` |

Note: both `gpt-service` and `recommendation_ai` default to port `5002`. Run one of them with a custom `PORT`, then update `GPT_SERVICE_URL` or `RECOMMENDATION_AI_URL` in `api-gateway/.env`.

## Prerequisites

- Node.js and npm.
- Python 3.10+.
- MongoDB database or MongoDB Atlas connection string.
- MySQL server.
- Optional API keys for GPT/recommendation features.
- Optional Cloudinary account for uploaded media storage.

## Environment Variables

Create a `.env` file inside each service that needs configuration. Do not commit real secrets.

### `frontend/.env`

```env
VITE_API_GATEWAY_URL=http://localhost:4000
```

### `api-gateway/.env`

```env
PORT=4000
FRONTEND_URL=http://localhost:5173
FRONTEND_URLS=http://localhost:5174,http://127.0.0.1:5173
BACKEND_SERVICE_URL=http://localhost:5001
GPT_SERVICE_URL=http://localhost:5002
RESOURCE_UPLOAD_URL=http://localhost:5000
EXPLAINABLE_AI_BACKEND_URL=http://localhost:8000
LIME_AI_SERVICE_URL=http://localhost:8110
SHAP_AI_SERVICE_URL=http://localhost:8011
RECOMMENDATION_AI_URL=http://localhost:5003
COGNITIVE_LOAD_SERVICE_URL=http://127.0.0.1:8021
COGNITIVE_STYLE_SERVICE_URL=http://localhost:8003
COGNITIVE_STYLE_AI_URL=http://localhost:8112
GATEWAY_SHARED_SECRET=change_this_secret
```

### `backend/.env`

```env
PORT=5001
MONGO_URI=mongodb://localhost:27017/userdb
JWT_SECRET=change_this_secret
RESOURCE_UPLOAD_URL=http://localhost:5000
GATEWAY_SHARED_SECRET=change_this_secret
```

### `Resource_upload/.env`

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/upload_section
JWT_SECRET=change_this_secret
GATEWAY_SHARED_SECRET=change_this_secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
PYTHON_EXECUTABLE=python
WHISPER_MODEL=base
```

### `gpt-service/.env`

```env
PORT=5002
MONGO_URI=mongodb://localhost:27017/content_transfer
MONGO_DB_NAME=content_transfer
JWT_SECRET=change_this_secret
HF_API_TOKEN=your_huggingface_token
HF_CHAT_URL=https://router.huggingface.co/v1/chat/completions
HF_MODEL=your_model_name
HF_MODEL_FALLBACKS=
```

### `recommendation_ai/.env`

```env
PORT=5003
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=class
COGNITIVE_DB_NAME=lime-data
COGNITIVE_STYLE_DB_NAME=cognitive-style-explanations
API_GATEWAY_URL=http://localhost:4000
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TIMEOUT_MS=120000
```

### `COGNITIVE-LOAD-API/.env`

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=cognitive_load_db
LIME_PREDICT_URL=http://127.0.0.1:8110/api/v1/predict
```

### `lime_ai/.env`

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=lime-data
MODEL_API_URL=http://127.0.0.1:8021
MODEL_API_PREDICT_PATH=/predict
MODEL_API_TIMEOUT_SECONDS=30
```

### `sharp_ai/.env`

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=lime-data
MODEL_API_URL=http://127.0.0.1:8021
MODEL_API_PREDICT_PATH=/predict
MODEL_API_TIMEOUT_SECONDS=30
```

### `explanable_ai/.env`

```env
DB_HOST=localhost
DB_PORT=3306
USER=root
PASSWORD=
DB_NAME=explanable_ai
GPT_API_KEY=your_gpt_key
GPT_MODEL=gpt-4o-mini
EXPLAINABILITY_MICROSERVICE_URL=http://127.0.0.1:8021
EXPLAINABILITY_MICROSERVICE_PATH=/predict
```

### `CognitiveStyleBackend/.env`

```env
MONGO_URL=mongodb://localhost:27017/cognitive_style
```

## Installation

Install Node dependencies for each JavaScript service:

```powershell
cd "E:\sliit projects\cognitive-load-api\frontend"
npm install

cd "E:\sliit projects\cognitive-load-api\api-gateway"
npm install

cd "E:\sliit projects\cognitive-load-api\backend"
npm install

cd "E:\sliit projects\cognitive-load-api\Resource_upload"
npm install

cd "E:\sliit projects\cognitive-load-api\gpt-service"
npm install

cd "E:\sliit projects\cognitive-load-api\recommendation_ai"
npm install
```

Install Python dependencies for each FastAPI service:

```powershell
cd "E:\sliit projects\cognitive-load-api\COGNITIVE-LOAD-API"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

cd "E:\sliit projects\cognitive-load-api\lime_ai"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

cd "E:\sliit projects\cognitive-load-api\sharp_ai"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

cd "E:\sliit projects\cognitive-load-api\explanable_ai"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

cd "E:\sliit projects\cognitive-load-api\CognitiveStyleBackend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

`Resource_upload/src/python/requirements.txt` contains the Python dependencies used by the upload transcription helper.

## Running The Project Locally

Start databases first:

- MongoDB for `backend`, `Resource_upload`, `gpt-service`, and `CognitiveStyleBackend`.
- MySQL for `COGNITIVE-LOAD-API`, `lime_ai`, `sharp_ai`, `explanable_ai`, and `recommendation_ai`.

Start the services in separate terminals:

## Useful Health Checks

```text
GET http://localhost:4000/
GET http://localhost:5002/health
GET http://127.0.0.1:8021/health
GET http://localhost:8110/api/v1/health
GET http://localhost:8011/api/v1/health
```

## Important API Areas

| Gateway Path | Backing Service | Notes |
| --- | --- | --- |
| `/api/auth/*` | `backend` | Teacher/student authentication. |
| `/api/dashboard/*` | `backend` | Dashboard data. |
| `/api/lessons/*` | `backend` | Lesson metadata and resource integration. |
| `/api/courses/*` | `Resource_upload` | Course CRUD and course structure. |
| `/api/sections/*` | `Resource_upload` | Section/subsection routes. |
| `/api/public/courses/*` | `Resource_upload` | Public course reads. |
| `/files/*` | `Resource_upload` | Uploaded file access. |
| `/api/gpt/*` | `gpt-service` | GPT prompt and answer flows. |
| `/api/cognitive-load/*` | `COGNITIVE-LOAD-API` | Prediction, raw event, feature-window, and XAI data routes. |
| `/api/lime-ai/*` | `lime_ai` | Prediction persistence and LIME-related service routes. |
| `/api/shap-ai/*` | `sharp_ai` | SHAP explanation service routes. |
| `/api/explainable/*` | `explanable_ai` | Explainable summaries and explanation generation. |
| `/api/recommendation/*` | `recommendation_ai` | Lesson analysis and teacher recommendations. |
| `/cognitive-style/*` | `CognitiveStyleBackend` | Gaze, cursor, cognitive style, assist question, and learner profile APIs. |

## Data Flow

1. A teacher creates courses and uploads resources through the frontend.
2. `Resource_upload` stores course content and extracts text/transcript data where applicable.
3. Students interact with lessons, quizzes, gaze/cursor tracking, and cognitive-style tasks.
4. The frontend posts cognitive-load raw events through the gateway.
5. `COGNITIVE-LOAD-API` extracts features, predicts cognitive load, stores logs, and can dispatch completed windows to `lime_ai`.
6. `lime_ai` stores prediction records in MySQL for later analysis.
7. `sharp_ai` and `explanable_ai` produce SHAP/LIME explanations and summaries.
8. `recommendation_ai` analyzes lesson-level cognitive-load summaries and returns teacher guidance.

## Database Notes

- `COGNITIVE-LOAD-API/sql/mysql_schema.sql` contains schema for the prediction API database.
- `lime_ai/db/init.sql` contains manual setup for the LIME prediction database.
- `sharp_ai/db/init.sql` contains setup for the SHAP service database.
- `backend/db/init.sql` contains backend database setup notes/assets.
- Some services create tables automatically on startup, but keeping SQL files available makes manual setup and troubleshooting easier.

## Development Notes

- Keep all browser calls pointed at the API gateway unless you are debugging a single service directly.
- Keep `GATEWAY_SHARED_SECRET` aligned between `api-gateway`, `backend`, and `Resource_upload`.
- Use distinct ports for `gpt-service` and `recommendation_ai`.
- Do not commit `.env`, virtual environments, `node_modules`, generated caches, uploaded files, or local database dumps.
- Prefer updating service-specific READMEs when changing a service's local setup, then keep this root README as the cross-project map.

## Branch History Summary

The available branches show how the current project grew:

- `origin/met_upload` and `origin/wimukthi` focus on course/resource upload plus the frontend/backend/gateway base.
- `origin/add_basic_explainable` adds the first explainability backend.
- `origin/add_lime` adds the cognitive-load API, GPT service, recommendation service, and LIME-related integration.
- `origin/course_upload` expands course upload and cognitive-load integration.
- `origin/image-gen` and `origin/image-part-final` include the fuller service set: cognitive-load API, cognitive-style backend, LIME, SHAP, GPT, recommendation, explainability, upload, gateway, backend, and frontend.
- `origin/Cognitive_Load` is closest to the broad integrated service layout.
- `origin/Congitive_Load` contains an earlier frontend/backend/cognitive-load slice.

=======
# deployment-prep
>>>>>>> origin/main
