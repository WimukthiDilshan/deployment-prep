from fastapi import APIRouter

from models.AhsQuestionnaireModel import (AHSIncomingPayload)
from services.AHSQuestionnaireService import process_ahs_questionnaire_service


router = APIRouter()

router = APIRouter(prefix="/anaylticwholistic", tags=["QuestionRunner Gaze"])

@router.post("/ahsquestionnaire", tags=["AhsQuestionnaire"])
async def save_ahs_questionnaire(payload: AHSIncomingPayload):
    # The router does nothing but call the service
    return await process_ahs_questionnaire_service(payload)