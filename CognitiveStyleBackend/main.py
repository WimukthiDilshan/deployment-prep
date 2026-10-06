import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from database.connection import client
from routes.UserRoutes import router as user_router
from fastapi.middleware.cors import CORSMiddleware
from routes.VisualVerbalCursorRoutes import router as simple_router
from routes.VisualVerbalGazeRoutes import router as gaze_router
from routes.VisualVerbalAnalysisRoutes import router as visual_verbal_analysis_router
from routes.AnalyticWholisticRouter import router as question_runner_gaze_router
from routes.QuestionRunnerCursorRouter import router as question_runner_cursor_router
from routes.QuestionRunnerCognitiveStyleRouter import router as question_runner_cognitivestyle_router
from routes.QuestionRunnerAnswerRouter import router as question_runner_answer_router
from routes.QuestionRunnerMLRouter import router as question_runner_ml_router
from routes.AssistQuestionRoute import router as assist_question_runner_gaze_router
from routes.LearnerProfileRoute import router as learner_profile_router
from routes.aiModelRoutes.VisualVerbalRoute import router as visual_verbal_ml_router
from routes.AhsQuestionnaireRouter import router as ahs_questionnaire_router
from routes.VVDQuestionnaireRouter import router as osv_questionnaire_router

app = FastAPI()


@app.get("/health")
async def health():
    try:
        await client.admin.command("ping")
        return {"status": "ok", "service": "cognitive-style-backend", "database": "ok"}
    except Exception:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503,
            detail={"status": "database_disconnected", "service": "cognitive-style-backend"},
        )
frontend_origins = [
    origin.strip()
    for origin in (
        os.getenv("FRONTEND_URL", "http://localhost:5173")
        + ","
        + os.getenv("FRONTEND_URLS", "http://localhost:5174")
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user_router)

app.include_router(simple_router)

app.include_router(gaze_router)

app.include_router(visual_verbal_analysis_router)

app.include_router(question_runner_gaze_router)

app.include_router(question_runner_cursor_router)

app.include_router(question_runner_cognitivestyle_router)

app.include_router(question_runner_answer_router)

app.include_router(question_runner_ml_router)

app.include_router(visual_verbal_ml_router)

app.include_router(assist_question_runner_gaze_router)

app.include_router(learner_profile_router)

app.include_router(ahs_questionnaire_router)

app.include_router(osv_questionnaire_router)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8003")),
        reload=os.getenv("RELOAD", "false").lower() == "true",
    )
