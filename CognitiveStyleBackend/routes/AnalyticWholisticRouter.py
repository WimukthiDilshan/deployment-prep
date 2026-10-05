# routes/AnalyticWholisticRouter.py

from fastapi import APIRouter, HTTPException
from models.QuestionRunnerGazeModel import (
    QuestionRunnerGazeEventCreate,
    QuestionRunnerGazeSessionComplete,
)
from models.AnalyticWholisticModel import SessionDataIncoming
from services.AnalyticWholisticService import (
    create_question_runner_gaze_event,
    get_question_runner_gaze_events,
    get_question_runner_gaze_events_by_session,
    complete_question_runner_gaze_session,
    get_question_runner_gaze_sessions,
process_csa_session
)

router = APIRouter(prefix="/anaylticwholistic", tags=["QuestionRunner Gaze"])


@router.post("/savebehavioraldata")
async def save_csa_session(session_data: SessionDataIncoming):
        return await process_csa_session(session_data)



@router.get("/gaze")
async def list_question_runner_gaze_events():
    return await get_question_runner_gaze_events()


@router.get("/gaze/{session_id}")
async def list_question_runner_gaze_events_by_session(session_id: str):
    return await get_question_runner_gaze_events_by_session(session_id)


@router.post("/gaze/complete")
async def complete_question_runner_gaze(session: QuestionRunnerGazeSessionComplete):
    return await complete_question_runner_gaze_session(session.model_dump())


@router.get("/gaze/sessions")
async def list_question_runner_gaze_sessions():
    return await get_question_runner_gaze_sessions()