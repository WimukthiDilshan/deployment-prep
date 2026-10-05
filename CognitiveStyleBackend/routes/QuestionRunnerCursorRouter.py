# routes/QuestionRunnerCursorRouter.py

from fastapi import APIRouter
from models.QuestionRunnerCursorModel import (
    QuestionRunnerCursorEventCreate,
    QuestionRunnerCursorSessionComplete,
)
from services.QuestionRunnerCursorService import (
    create_question_runner_cursor_event,
    get_question_runner_cursor_events,
    get_question_runner_cursor_events_by_session,
    complete_question_runner_cursor_session,
    get_question_runner_cursor_sessions,
)

router = APIRouter(prefix="/question-runner", tags=["QuestionRunner Cursor"])


@router.post("/cursor")
async def add_cursor_event(event: QuestionRunnerCursorEventCreate):
    return await create_question_runner_cursor_event(event.model_dump())


@router.get("/cursor")
async def list_cursor_events():
    return await get_question_runner_cursor_events()


@router.get("/cursor/{session_id}")
async def list_cursor_events_by_session(session_id: str):
    return await get_question_runner_cursor_events_by_session(session_id)


@router.post("/cursor/complete")
async def complete_cursor_session(session: QuestionRunnerCursorSessionComplete):
    return await complete_question_runner_cursor_session(session.model_dump())


@router.get("/cursor/sessions")
async def list_cursor_sessions():
    return await get_question_runner_cursor_sessions()