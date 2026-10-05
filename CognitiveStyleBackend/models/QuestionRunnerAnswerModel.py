from pydantic import BaseModel
from typing import Optional


class QuestionRunnerAnswerCreate(BaseModel):
    sessionId: str
    questionId: int
    selectedAnswer: str
    correctAnswer: str
    isCorrect: bool


class QuestionRunnerAnswerSessionComplete(BaseModel):
    sessionId: str
    userId: Optional[str] = None
    moduleName: Optional[str] = "QuestionRunner"