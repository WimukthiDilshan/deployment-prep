from pydantic import BaseModel

# ---------------------------------------------------------
# 1. Models
# ---------------------------------------------------------

# Matches the flat payload sent from React (Unchanged)
class CursorSummaryCreate(BaseModel):
    userId: str
    totalActiveTimeMs: int
    visualTimeMs: int
    textTimeMs: int
    visualScrolls: int
    textScrolls: int

# Defines what is returned and what lives in the DB (Updated for ML)
class CursorSummaryResponse(BaseModel):
    userId: str
    timeTakenMs: int
    imageCursorRatio: float
    imageScrollRatio: float