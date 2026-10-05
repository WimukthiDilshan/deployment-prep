from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class QuestionAnswer(BaseModel):
    questionNumber: int
    question: str
    value: int = Field(..., ge=1, le=5)

class AssistQuestionCreate(BaseModel):
    user_id: str
    answers: List[QuestionAnswer]

class AssistQuestionResponse(BaseModel):
    id: str
    user_id: str
    answers: List[QuestionAnswer]
    deep_score: float
    strategic_score: float
    surface_score: float
    dominant_profile: str
    cluster_group: Optional[int] = None
    created_at: datetime