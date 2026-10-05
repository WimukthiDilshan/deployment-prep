from fastapi import APIRouter
from models.VisualVerbalCursorModel import SimpleEventCreate, SimpleSessionComplete
from models.VisualVerbalCursorWithLimitedInputs import CursorSummaryResponse,CursorSummaryCreate
from services.VisualVerbalCursorService import (
    create_simple_event,
    get_simple_events,
    get_simple_events_by_session,
    complete_simple_session,
    get_simple_sessions,
)

router = APIRouter(prefix="/simple", tags=["Simple Metrics"])


# Previous impl is commenting out bz need to check new les input impl is working
# @router.post("/cursor-summary")
# async def add_simple_event(event: SimpleEventCreate):
#     return await create_simple_event(event.model_dump())

@router.post("/cursor-summary", response_model=CursorSummaryResponse)
async def add_simple_event(event: CursorSummaryCreate):
    # Pass the raw dictionary to the service method
    return await create_simple_event(event.model_dump())

@router.get("/events")
async def list_simple_events():
    return await get_simple_events()


@router.get("/events/{session_id}")
async def list_simple_events_by_session(session_id: str):
    return await get_simple_events_by_session(session_id)


@router.post("/complete")
async def complete_session(session: SimpleSessionComplete):
    return await complete_simple_session(session.model_dump())


@router.get("/sessions")
async def list_simple_sessions():
    return await get_simple_sessions()