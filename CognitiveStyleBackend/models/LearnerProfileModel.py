from pydantic import BaseModel

QUESTION_FACTORS = {
    "deep": [1, 2, 3],
    "organized": [4, 5, 6],
    "surface": [7, 8, 9],
    "dissonant": [10, 11]
}

class FactorScores(BaseModel):
    deep: float
    organized: float
    surface: float
    dissonant: float

class LearnerProfileResponse(BaseModel):
    user_id: str
    factor_scores: FactorScores
    learner_profile: str