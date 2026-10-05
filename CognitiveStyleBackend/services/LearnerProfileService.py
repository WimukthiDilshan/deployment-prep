from database.connection import assist_question_collection
from models.LearnerProfileModel import QUESTION_FACTORS

def calculate_factor_scores(answers):
    values = {item["questionNumber"]: item["value"] for item in answers}

    return {
        "deep": sum(values[q] for q in QUESTION_FACTORS["deep"]) / 3,
        "organized": sum(values[q] for q in QUESTION_FACTORS["organized"]) / 3,
        "surface": sum(values[q] for q in QUESTION_FACTORS["surface"]) / 3,
        "dissonant": sum(values[q] for q in QUESTION_FACTORS["dissonant"]) / 2,
    }

def classify_learner_profile(factors):
    if factors["deep"] >= 3.5 and factors["organized"] >= 3.5:
        return "Organized Deep"
    elif factors["deep"] >= 3.5:
        return "Unorganized Deep"
    elif factors["surface"] >= 3.5:
        return "Unreflective"
    else:
        return "Dissonant"

async def generate_learner_profile(user_id: str):
    doc = await assist_question_collection.find_one({"user_id": user_id})
    if not doc:
        return None

    factors = calculate_factor_scores(doc["answers"])
    profile = classify_learner_profile(factors)

    return {
        "user_id": user_id,
        "factor_scores": factors,
        "learner_profile": profile
    }

#Sanjaya Request to return only Leaner profile
async def generate_learner_profile_return_profile_only(user_id: str):
    result = await generate_learner_profile(user_id)

    if not result:
        return None

    return {
        "learner_profile": result["learner_profile"]
    }