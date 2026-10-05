# routes/QuestionRunnerCognitiveStyleRouter.py

from fastapi import APIRouter
from services.QuestionRunnerCognitiveStyleService import (
    infer_question_runner_cognitive_style,
)

router = APIRouter(prefix="/question-runner", tags=["QuestionRunner Cognitive Style"])


@router.get("/cognitive-style/{session_id}")
async def get_question_runner_cognitive_style(session_id: str):
    return await infer_question_runner_cognitive_style(session_id)