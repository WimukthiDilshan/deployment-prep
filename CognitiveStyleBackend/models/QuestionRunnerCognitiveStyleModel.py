# models/QuestionRunnerCognitiveStyleModel.py

from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class QuestionRunnerCognitiveStyleRequest(BaseModel):
    sessionId: str
    userId: Optional[str] = None
    moduleName: Optional[str] = "QuestionRunner"


class QuestionRunnerCognitiveStyleResponse(BaseModel):
    sessionId: str
    cognitiveStyle: str
    analyticScore: float
    holisticScore: float
    confidence: float
    correctnessRatio: float
    reasons: List[str]
    features: Dict[str, Any]