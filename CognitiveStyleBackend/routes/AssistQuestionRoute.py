from fastapi import APIRouter, HTTPException
from models.AssistQuestionModel import (AssistQuestionCreate,AssistQuestionResponse)
from services.AssistQuestionService import (
    create_assist_question,
    get_all_assist_questions,
    get_assist_questions_by_user,
    get_single_response
)

router = APIRouter(prefix="/assist-questions", tags=["Assist Questions"])


@router.post("/", response_model=AssistQuestionResponse)
async def submit_assist_questions(payload: AssistQuestionCreate):
    try:
        return await create_assist_question(payload.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def list_all_assist_questions():
    return await get_all_assist_questions()


@router.get("/user/{user_id}")
async def get_user_assist_questions(user_id: str):
    return await get_assist_questions_by_user(user_id)


@router.get("/{response_id}")
async def get_assist_question(response_id: str):
    response = await get_single_response(response_id)

    if not response:
        raise HTTPException(status_code=404, detail="Response not found")

    return response