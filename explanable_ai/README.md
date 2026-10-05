# Explainable AI Module

This folder contains the Explainable AI backend in a flat structure (no nested `backend/` directory).

## Current Structure

- `main.py` - FastAPI entrypoint.
- `config/`, `models/`, `repositories/`, `routers/`, `services/`, `scripts/` - backend modules.
- `.env.example` and `requirements.txt` - local backend configuration/dependencies.

## Integration

- Main UI is in the project root `frontend/` application.
- API gateway proxies explainable endpoints from:
	- `/api/explainable/v1/*` -> `http://localhost:8000/api/v1/*`

## Run Backend

1. Open terminal in `explanable_ai`.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Start server:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```