from pydantic import BaseModel
from typing import Optional


class SimpleEventCreate(BaseModel):
    sessionId: str
    windowStart: int
    windowEnd: int

    visualTimeRatio: float
    textTimeRatio: float

    avgHoverVisual: float
    avgHoverText: float

    avgSpeedVisual: float
    avgSpeedText: float

    clickCountVisual: int
    clickCountText: int

    scrollCountVisual: int
    scrollCountText: int

    zoneSwitchCount: int


class SimpleEventResponse(BaseModel):
    sessionId: str
    windowStart: int
    windowEnd: int

    visualTimeRatio: float
    textTimeRatio: float

    avgHoverVisual: float
    avgHoverText: float

    avgSpeedVisual: float
    avgSpeedText: float

    clickCountVisual: int
    clickCountText: int

    scrollCountVisual: int
    scrollCountText: int

    zoneSwitchCount: int


class SimpleSessionComplete(BaseModel):
    sessionId: str
    userId: Optional[str] = None
    moduleName: Optional[str] = "module2"