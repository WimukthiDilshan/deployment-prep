# routes/QuestionRunnerAnswerRouter.py

from fastapi import APIRouter
from models.QuestionRunnerAnswerModel import (
    QuestionRunnerAnswerCreate,
    QuestionRunnerAnswerSessionComplete,
)
from services.QuestionRunnerAnswerService import (
    create_question_runner_answer,
    get_question_runner_answers,
    get_question_runner_answers_by_session,
    complete_question_runner_answer_session,
    get_question_runner_answer_sessions,
)

router = APIRouter(prefix="/question-runner", tags=["QuestionRunner Answers"])


@router.post("/answers")
async def add_question_runner_answer(answer: QuestionRunnerAnswerCreate):
    return await create_question_runner_answer(answer.model_dump())


@router.get("/answers")
async def list_question_runner_answers():
    return await get_question_runner_answers()


@router.get("/answers/{session_id}")
async def list_question_runner_answers_by_session(session_id: str):
    return await get_question_runner_answers_by_session(session_id)


@router.post("/answers/complete")
async def complete_question_runner_answers(session: QuestionRunnerAnswerSessionComplete):
    return await complete_question_runner_answer_session(session.model_dump())


@router.get("/answers/sessions")
async def list_question_runner_answer_sessions():
    return await get_question_runner_answer_sessions()