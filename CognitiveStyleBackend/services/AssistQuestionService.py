from datetime import datetime
from bson import ObjectId
from database.connection import assist_question_collection,student_collection
import numpy as np
from sklearn.cluster import KMeans
from datetime import datetime
from bson import ObjectId

# Map the question numbers to their respective scales based on the research paper
DEEP_QUESTIONS = {2, 6, 10, 12, 15, 17}
STRATEGIC_QUESTIONS = {3, 5, 7, 9, 11, 13}
SURFACE_QUESTIONS = {1, 4, 8, 14, 16, 18}

# NOTE: Ensure both collections are defined in your database config.
# assist_question_collection = ...
# students_collection = ...

async def create_assist_question(data: dict):
    # 1. Calculate the Raw Scores
    deep_score = 0
    strategic_score = 0
    surface_score = 0

    for answer in data.get("answers", []):
        q_num = answer["questionNumber"]
        val = answer["value"]

        if q_num in DEEP_QUESTIONS:
            deep_score += val
        elif q_num in STRATEGIC_QUESTIONS:
            strategic_score += val
        elif q_num in SURFACE_QUESTIONS:
            surface_score += val

    data["deep_score"] = deep_score
    data["strategic_score"] = strategic_score
    data["surface_score"] = surface_score

    # 2. Determine Dominant Profile
    scores = {
        "Deep Approach": deep_score,
        "Strategic Approach": strategic_score,
        "Surface Approach": surface_score
    }
    dominant_profile = max(scores, key=scores.get)
    data["dominant_profile"] = dominant_profile

    # 3. Update the Student's learnerProfile in the 'userdb' database
    user_id = data.get("user_id")
    if user_id:
        try:
            query_filter = {"_id": ObjectId(user_id)}
        except Exception:
            query_filter = {"_id": user_id}

        await student_collection.update_one(
            query_filter,
            {"$set": {"learnerProfile": dominant_profile}}
        )

    # 4. Save Response to Database
    data["created_at"] = datetime.utcnow()
    result = await assist_question_collection.insert_one(data)

    # Fetch and format the newly created document for the API response
    new_doc = await assist_question_collection.find_one({"_id": result.inserted_id})

    if new_doc:
        new_doc["id"] = str(new_doc["_id"])
        del new_doc["_id"]

    return new_doc


async def get_all_assist_questions():
    responses = []
    async for doc in assist_question_collection.find():
        doc["_id"] = str(doc["_id"])
        responses.append(doc)
    return responses


async def get_assist_questions_by_user(user_id: str):
    responses = []
    async for doc in assist_question_collection.find({"user_id": user_id}):
        doc["_id"] = str(doc["_id"])
        responses.append(doc)
    return responses


async def get_single_response(response_id: str):
    doc = await assist_question_collection.find_one({"_id": ObjectId(response_id)})
    if not doc:
        return None

    doc["_id"] = str(doc["_id"])
    return doc