from fastapi import APIRouter, HTTPException
from models.VVDQuestionnaireModel import VVQResponse,VVQCreate
from services.VVDQuestionnaireService import create_vvq_record

from fastapi import APIRouter, HTTPException
# Note: Adjust your imports to match your file structure
# from models.VVQModel import VVQResponse, VVQCreate
# from services.VVQService import create_vvq_record

# ==========================================
# 3. ROUTER ENDPOINT
# ==========================================

router = APIRouter(prefix="/vvq-questions", tags=["Assist Questions"])

@router.post("/create", response_model=VVQResponse)
async def submit_vvq_questions(payload: VVQCreate):
    try:
        # Pass the dumped model to the service layer
        return await create_vvq_record(payload.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))