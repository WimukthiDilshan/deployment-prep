from fastapi import APIRouter
from aiModel.VisualVerbalMLService import predict_visual_verbal_ml,predict_visual_verbal_ml_Return_Only_Prediction

router = APIRouter(prefix="/simple-ml", tags=["Visual Verbal ML"])


@router.get("/visual-verbal/{session_id}")
async def get_visual_verbal_prediction(session_id: str):
    return await predict_visual_verbal_ml(session_id)

#Route to return only prediction
@router.get("/visual-verbal/prediction-only/{session_id}")
async def get_visual_verbal_prediction_only_prediction(session_id: str):
    return await predict_visual_verbal_ml_Return_Only_Prediction(session_id)