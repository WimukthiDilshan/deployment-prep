# models/QuestionRunnerGazeModel.py

from pydantic import BaseModel
from typing import Optional


class QuestionRunnerGazeEventCreate(BaseModel):
    sessionId: str
    questionId: Optional[int] = None

    windowStartTs: int
    windowEndTs: int
    durationMs: int
    frameCount: int

    facePresentRatio: float
    centerRatio: float
    eyesOpenRatio: float

    yawMean: float
    yawStd: float

    pitchMean: float
    pitchStd: float

    eyeOffsetXMean: float
    eyeOffsetXStd: float

    eyeOffsetYMean: float
    eyeOffsetYStd: float

    avgEyeOpennessMean: float
    avgEyeOpennessStd: float

    gazeConfidenceMean: float

    eyeMovementMagnitudeMean: float
    eyeMovementMagnitudeStd: float

    blinkCount: int
    blinkRatePerMin: float
    directionChangeCount: int
    attentionScore: float


class QuestionRunnerGazeSessionComplete(BaseModel):
    sessionId: str
    userId: Optional[str] = None
    moduleName: Optional[str] = "QuestionRunner"