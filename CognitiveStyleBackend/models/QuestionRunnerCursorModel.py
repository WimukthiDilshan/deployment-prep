# models/QuestionRunnerCursorModel.py

from pydantic import BaseModel
from typing import Optional


class QuestionRunnerCursorEventCreate(BaseModel):
    sessionId: str
    questionId: int

    responseTimeMs: int
    totalDistance: float
    avgSpeed: float
    pauseCount: int
    directionChangeCount: int
    pathEfficiency: float
    clickCount: int
    timeToFirstMovementMs: int
    pointCount: int


class QuestionRunnerCursorSessionComplete(BaseModel):
    sessionId: str
    userId: Optional[str] = None
    moduleName: Optional[str] = "QuestionRunner"