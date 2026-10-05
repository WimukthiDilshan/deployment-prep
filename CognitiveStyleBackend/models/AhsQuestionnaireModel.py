from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# Sub-model for individual answers
class AHSAnswerIncoming(BaseModel):
    questionId: int
    rawScore: int  # The raw 1-7 score from the frontend

# Model 1: Receives the raw data from the React frontend
class AHSIncomingPayload(BaseModel):
    userId: str
    answers: List[AHSAnswerIncoming]
    # We include visualTaskData as Optional in case you are passing the gaze data here too
    visualTaskData: Optional[Dict[str, Any]] = None

# Sub-model for the processed answers in the DB
class AHSAnswerDB(BaseModel):
    questionId: int
    rawScore: int
    finalScore: int
    isReverseScored: bool

# Model 2: Defines the clean data structure for the Database
class AHSDataDB(BaseModel):
    userId: str
    answers: List[AHSAnswerDB]
    overallAhsAverage: float
    cognitiveStyle: str  # "Analytic" or "Wholistic"
    visualTaskData: Optional[Dict[str, Any]] = None