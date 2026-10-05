from fastapi import APIRouter, HTTPException
from services.LearnerProfileService import generate_learner_profile,generate_learner_profile_return_profile_only

router = APIRouter(prefix="/learner-profile", tags=["Learner Profile"])


#Route to return only learner profile
@router.get("/profile-only/{user_id}")
async def get_learner_profile_only_profile(user_id: str):
    result = await generate_learner_profile_return_profile_only(user_id)
    if not result:
        raise HTTPException(status_code=404, detail="No answers found for this user")
    return result

@router.get("/{user_id}")
async def get_learner_profile(user_id: str):
    result = await generate_learner_profile(user_id)
    if not result:
        raise HTTPException(status_code=404, detail="No answers found for this user")
    return result

