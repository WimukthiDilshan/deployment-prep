from fastapi import APIRouter
from services.VisualVerbalAnalysisService import analyze_visual_verbal_session

router = APIRouter(prefix="/simple", tags=["Visual Verbal Analysis"])

@router.get("/analyze/{session_id}")
async def analyze_visual_verbal(session_id: str):
    return await analyze_visual_verbal_session(session_id)