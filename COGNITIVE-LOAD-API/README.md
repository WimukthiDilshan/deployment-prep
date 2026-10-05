# Cognitive Load API

## Permanent local run command

Use the project launcher from PowerShell:

```powershell
cd "E:\sliit projects\cognitive-load-api\COGNITIVE-LOAD-API"
.\start-api.ps1
```

The launcher uses `.venv\Scripts\python.exe -m uvicorn`, so it works even when the `uvicorn` command is not on your PATH.

To reinstall dependencies later:

```powershell
.\start-api.ps1 -Install
```

## Manual setup

If you want to run the commands yourself:

```powershell
cd "E:\sliit projects\cognitive-load-api\COGNITIVE-LOAD-API"
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8021
```

Important: use `app.main:app`, not only `app.main`. The `:app` part tells Uvicorn which FastAPI object to run.

## Novel module: cognitive load trend analysis

The API includes a temporal analysis layer for:

- cognitive load trend detection
- risk-level detection

This layer uses saved prediction windows from the existing cognitive-load model. It does not require a separate ML model.

Endpoint:

```text
GET /students/{student_id}/lessons/{lesson_id}/load-trend
```

Optional query parameters:

```text
session_id
limit
```

Example response:

```json
{
  "student_id": "S001",
  "lesson_id": "L001",
  "session_id": "SESSION-1",
  "current_load": "High",
  "current_score": 4,
  "trend": "rising",
  "risk_level": "high",
  "timeline": [
    {
      "minute_index": 1,
      "predicted_load": "Low",
      "predicted_score": 2
    },
    {
      "minute_index": 2,
      "predicted_load": "Medium",
      "predicted_score": 3
    },
    {
      "minute_index": 3,
      "predicted_load": "High",
      "predicted_score": 4
    }
  ]
}
```

Trend outputs:

```text
rising
decreasing
stable
fluctuating
insufficient_data
```

Run the module tests:

```powershell
cd "E:\sliit projects\cognitive-load-api\COGNITIVE-LOAD-API"
.\.venv\Scripts\python.exe -m unittest discover tests
```
