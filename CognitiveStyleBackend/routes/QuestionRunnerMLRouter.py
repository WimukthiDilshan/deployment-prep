from fastapi import APIRouter
from services.QuestionRunnerMLService import predict_question_runner_cognitive_style,predict_question_runner_cognitive_style_prediction_only

router = APIRouter(prefix="/question-runner", tags=["QuestionRunner ML"])


@router.get("/ml-cognitive-style/{session_id}")
async def get_ml_cognitive_style(session_id: str):
    return await predict_question_runner_cognitive_style(session_id)

#Route to return only prediction
@router.get("/ml-cognitive-style/prediction-only/{session_id}")
async def get_ml_cognitive_style(session_id: str):
    return await predict_question_runner_cognitive_style_prediction_only(session_id)