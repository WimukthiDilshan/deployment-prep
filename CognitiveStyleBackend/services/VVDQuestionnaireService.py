from datetime import datetime
# Note: Rename your MongoDB collection import as needed
from database.connection import vvq_collection

# VVQ Scoring Definitions
# Standard Items: True = 1 point, False = 0 points
STANDARD_QUESTIONS = {2, 5, 7, 11, 14, 15}

# Reverse Items: False = 1 point, True = 0 points
REVERSE_QUESTIONS = {1, 3, 4, 6, 8, 9, 10, 12, 13}

# ==========================================
# 4. SERVICE LOGIC
# ==========================================
async def create_vvq_record(data: dict):
    total_score = 0
    enriched_answers = []

    # 1. Process each answer and apply scoring logic
    for answer in data.get("answers", []):
        q_id = answer["questionId"]
        raw_val = answer["rawScore"]  # "True" or "False"

        calculated_score = 0

        if q_id in STANDARD_QUESTIONS:
            calculated_score = 1 if raw_val == "True" else 0
        elif q_id in REVERSE_QUESTIONS:
            calculated_score = 1 if raw_val == "False" else 0

        total_score += calculated_score

        # Store the enriched answer
        enriched_answers.append({
            "questionId": q_id,
            "rawScore": raw_val,
            "calculatedScore": calculated_score
        })

    # 2. Determine Dominant Profile (Visual, Moderate, or Verbal)
    if total_score <= 7:
        dominant_profile = "Verbal"
    elif 8 <= total_score <= 11:
        dominant_profile = "Moderate/Intermediatory"
    else:
        dominant_profile = "Visual"

    # 3. Prepare Final Document for Database
    db_document = {
        "userId": data.get("userId"),
        "visualTaskData": data.get("visualTaskData"), # Tracking data from earlier modules
        "answers": enriched_answers,
        "total_score": total_score,
        "dominant_profile": dominant_profile,
        "created_at": datetime.utcnow()
    }

    # 4. Save to Database
    result = await vvq_collection.insert_one(db_document)

    # Fetch the newly created document to return it
    new_doc = await vvq_collection.find_one({"_id": result.inserted_id})

    # 5. Format Response
    # MongoDB uses an ObjectId for the _id field, but our Pydantic model expects a string 'id'
    if new_doc:
        new_doc["id"] = str(new_doc["_id"])
        del new_doc["_id"]

    return new_doc