from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

# ==========================================
# 2. PYDANTIC MODELS
# ==========================================
class VVQAnswer(BaseModel):
    questionId: int
    rawScore: str  # Will capture "True" or "False" from the frontend

class VVQCreate(BaseModel):
    userId: str
    answers: List[VVQAnswer]
    visualTaskData: Optional[Dict[str, Any]] = None # Captures the payload passed from Module 2

class VVQResponse(BaseModel):
    id: str
    userId: str
    answers: List[Dict[str, Any]]  # Will contain the raw answer and calculated score
    total_score: int
    dominant_profile: str
    created_at: datetime