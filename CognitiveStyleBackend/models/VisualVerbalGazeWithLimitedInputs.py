from pydantic import BaseModel

# Model 1: Receives the raw data from the React frontend
class GazeEventIncoming(BaseModel):
    userId: str
    totalActiveTimeMs: int
    visualGazeTimeMs: int
    textGazeTimeMs: int
    firstInteractionPreference: str

# Model 2: Defines the clean data structure for the Database
class GazeEventDB(BaseModel):
    userId: str
    FirstInteractionPreference: str
    ImageGazeRatio: float
    timeTakenMs: int  # Added new field