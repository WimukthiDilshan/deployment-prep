# from fastapi import APIRouter
# from models.GazeModel import GazeEventCreate, GazeSessionComplete
# from services.GazeService import (
#     create_gaze_event,
#     get_gaze_events_by_session,
#     complete_gaze_session,
#     get_gaze_sessions,
# )
#
# router = APIRouter(prefix="/gaze", tags=["Gaze Metrics"])
#
#
# @router.post("/event")
# async def add_gaze_event(event: GazeEventCreate):
#     return await create_gaze_event(event.model_dump())
#
#
# @router.get("/events/{session_id}")
# async def get_events(session_id: str):
#     return await get_gaze_events_by_session(session_id)
#
#
# @router.post("/complete")
# async def complete_session(session: GazeSessionComplete):
#     return await complete_gaze_session(session.model_dump())
#
#
# @router.get("/sessions")
# async def get_sessions():
#     return await get_gaze_sessions()

# from fastapi import APIRouter
# from models.GazeModel import GazeEventCreate, GazeSessionComplete
# from services.GazeService import (
#     create_gaze_event,
#     get_gaze_events_by_session,
#     complete_gaze_session,
#     get_gaze_sessions,
# )
#
# router = APIRouter(prefix="/gaze", tags=["Gaze Metrics"])
#
#
# @router.post("/event")
# async def add_gaze_event(event: GazeEventCreate):
#     return await create_gaze_event(event.model_dump())
#
#
# @router.get("/events/{session_id}")
# async def get_events(session_id: str):
#     return await get_gaze_events_by_session(session_id)
#
#
# @router.post("/complete")
# async def complete_session(session: GazeSessionComplete):
#     return await complete_gaze_session(session.model_dump())
#
#
# @router.get("/sessions")
# async def get_sessions():
#     return await get_gaze_sessions()


from fastapi import APIRouter
from models.VisualVerbalGazeModel import GazeEventCreate, GazeSessionComplete
from models.VisualVerbalGazeWithLimitedInputs import GazeEventIncoming,GazeEventDB
from services.VisualVerbalGazeService import (
    get_gaze_events_by_session,
    complete_gaze_session,
    get_gaze_sessions,
create_gaze_event_service
)

router = APIRouter(prefix="/gaze", tags=["Gaze Metrics"])


@router.post("/event")
async def add_gaze_event(event: GazeEventIncoming):
    # The router does nothing but call the service
    return await create_gaze_event_service(event)


@router.get("/events/{session_id}")
async def get_events(session_id: str):
    return await get_gaze_events_by_session(session_id)


@router.post("/complete")
async def complete_session(session: GazeSessionComplete):
    return await complete_gaze_session(session.model_dump())


@router.get("/sessions")
async def get_sessions():
    return await get_gaze_sessions()