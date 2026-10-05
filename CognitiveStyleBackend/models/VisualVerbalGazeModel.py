# from pydantic import BaseModel
# from typing import Optional
#
#
# class GazeEventCreate(BaseModel):
#     sessionId: str
#     windowStart: int
#     windowEnd: int
#
#     frameCount: int
#     facePresentRatio: float
#     centerGazeRatio: float
#
#     avgYaw: float
#     avgPitch: float
#
#     avgEyeOffsetX: float
#     avgEyeOffsetY: float
#
#     avgEyeOpenness: float
#     avgGazeConfidence: float
#
#     blinkCount: int
#
#
# class GazeSessionComplete(BaseModel):
#     sessionId: str
#     userId: Optional[str] = None
#     moduleName: Optional[str] = "module2"


#
# from pydantic import BaseModel
# from typing import Optional
#
#
# class GazeEventCreate(BaseModel):
#     sessionId: str
#     windowStart: int
#     windowEnd: int
#
#     frameCount: int
#     facePresentRatio: float
#     blinkCount: int
#
#     avgYaw: float
#     avgPitch: float
#
#     avgEyeOffsetX: float
#     avgEyeOffsetY: float
#     avgLeftEyeOffsetX: float
#     avgRightEyeOffsetX: float
#     avgEyeOffsetDisagreementX: float
#
#     avgEyeOpenness: float
#     avgGazeConfidence: float
#
#     avgNoseTipX: float
#     avgNoseTipY: float
#     avgFaceCenterX: float
#     avgFaceCenterY: float
#     avgFaceWidth: float
#     avgFaceHeight: float
#     avgEyeCenterX: float
#
#     avgDeltaYaw: float
#     avgDeltaEyeOffsetX: float
#     avgDeltaFaceCenterX: float
#     avgDeltaNoseTipX: float
#
#     leftMoveRatio: float
#     rightMoveRatio: float
#     stableRatio: float
#     movementSwitchCount: int
#
#
# class GazeSessionComplete(BaseModel):
#     sessionId: str
#     userId: Optional[str] = None
#     moduleName: Optional[str] = "module2"


from pydantic import BaseModel
from typing import Optional, Literal


class GazeEventCreate(BaseModel):
    sessionId: str
    windowStart: int
    windowEnd: int

    frameCount: int
    facePresentRatio: float

    lookLeftFrames: int
    lookRightFrames: int
    centerFrames: int

    avgEyeLookInLeft: float
    avgEyeLookInRight: float
    avgLookDiff: float

    dominantGaze: Literal["LEFT", "RIGHT", "CENTER"]


class GazeSessionComplete(BaseModel):
    sessionId: str
    userId: Optional[str] = None
    moduleName: Optional[str] = "module2"