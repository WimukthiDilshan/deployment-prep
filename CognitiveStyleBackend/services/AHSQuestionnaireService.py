# Assuming your db collection is initialized like this:from
from bson import ObjectId

from database.connection import (ahs_question_collection,student_collection)
from models.AhsQuestionnaireModel import (
    AHSAnswerDB,AHSIncomingPayload,AHSDataDB )


async def process_ahs_questionnaire_service(payload: AHSIncomingPayload):
    # 1. Define the specific questions that require reverse scoring based on the AHS framework
    reverse_scored_ids = {11, 13, 14, 15, 16, 18}

    total_score = 0
    processed_answers = []

    # 2. Loop through all submitted answers and perform the calculations
    for ans in payload.answers:
        is_reverse = ans.questionId in reverse_scored_ids

        if is_reverse:
            # 7-point Likert scale inversion: 8 - rawScore
            final_score = 8 - ans.rawScore
        else:
            final_score = ans.rawScore

        total_score += final_score

        # Append detailed breakdown for the database
        processed_answers.append(
            AHSAnswerDB(
                questionId=ans.questionId,
                rawScore=ans.rawScore,
                finalScore=final_score,
                isReverseScored=is_reverse
            )
        )

    # 3. Calculate the overall average (Assuming exactly 24 questions are submitted)
    question_count = len(payload.answers)
    overall_average = round(total_score / question_count, 2) if question_count > 0 else 0

    # 4. Determine Cognitive Style based on the threshold
    # >= 4.0 leans Wholistic (Holistic), < 4.0 leans Analytic
    cognitive_style = "Wholistic" if overall_average >= 4.0 else "Analytic"

    # 5. --- NEW: Update the Student in the 'userdb' database ---
    if payload.userId:
        try:
            query_filter = {"_id": ObjectId(payload.userId)}
        except Exception:
            query_filter = {"_id": payload.userId}

        # Assuming student_collection is available in scope (imported from your DB file)
        await student_collection.update_one(
            query_filter,
            {"$set": {"analyticWholisticCognitiveStyle": cognitive_style}}
        )
    # -----------------------------------------------------------

    # 6. Map the data into the DB Model
    db_payload = AHSDataDB(
        userId=payload.userId,
        answers=processed_answers,
        overallAhsAverage=overall_average,
        cognitiveStyle=cognitive_style,
        visualTaskData=payload.visualTaskData
    )

    # 7. Insert into MongoDB
    result = await ahs_question_collection.insert_one(db_payload.model_dump())

    # 8. Fetch and format the response
    new_record = await ahs_question_collection.find_one({"_id": result.inserted_id})

    if new_record:
        new_record["_id"] = str(new_record["_id"])

    return new_record