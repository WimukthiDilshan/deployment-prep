from pydantic import BaseModel
from typing import Dict, List

# --- INCOMING REACT PAYLOAD MODELS ---

class AnswerIncoming(BaseModel):
    selectedAnswer: str
    isCorrect: bool
    responseTimeMs: float

class GazeWindowIncoming(BaseModel):
    sessionId: str  # In your React app, this acts as the userId
    questionId: int
    windowStartTs: int
    windowEndTs: int
    durationMs: int
    frameCount: int
    transitions: int
    totalDwellTime: int
    dwellLeftMs: int
    dwellRightMs: int

class SessionDataIncoming(BaseModel):
    sessionStartTime: int
    sessionEndTime: int
    totalQuestions: int
    answers: Dict[str, AnswerIncoming]
    gazeWindows: List[GazeWindowIncoming]


# --- DATABASE AGGREGATION MODEL ---

class AggregatedBehavioralDB(BaseModel):
    userId: str
    Median_RT_Global: float
    Median_RT_Local: float
    Avg_Transitions_Global: float
    Avg_Transitions_Local: float
    Avg_Dwell_Time_Global: float
    Avg_Dwell_Time_Local: float
    Total_Accuracy: int
    IsValidForModel: bool  # Will be set to False if accuracy < 56/80