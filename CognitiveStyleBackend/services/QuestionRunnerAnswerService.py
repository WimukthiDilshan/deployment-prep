# services/QuestionRunnerAnswerService.py

from database.connection import (
    question_runner_answer_collection,
    question_runner_answer_session_collection,
)


async def create_question_runner_answer(answer_data: dict):
    result = await question_runner_answer_collection.insert_one(answer_data)
    new_answer = await question_runner_answer_collection.find_one(
        {"_id": result.inserted_id}
    )

    if new_answer:
        new_answer["_id"] = str(new_answer["_id"])

    return new_answer


async def get_question_runner_answers():
    answers = []
    async for answer in question_runner_answer_collection.find():
        answer["_id"] = str(answer["_id"])
        answers.append(answer)
    return answers


async def get_question_runner_answers_by_session(session_id: str):
    answers = []
    async for answer in question_runner_answer_collection.find(
        {"sessionId": session_id}
    ):
        answer["_id"] = str(answer["_id"])
        answers.append(answer)
    return answers


async def aggregate_question_runner_answers(session_id: str):
    answers = []

    async for answer in question_runner_answer_collection.find(
        {"sessionId": session_id}
    ):
        answers.append(answer)

    if not answers:
        return None

    total = len(answers)
    correct = sum(1 for a in answers if a.get("isCorrect") is True)
    incorrect = total - correct

    return {
        "totalQuestions": total,
        "correctCount": correct,
        "incorrectCount": incorrect,
        "correctnessRatio": round(correct / total, 4) if total else 0,
    }


async def complete_question_runner_answer_session(session_data: dict):
    session_id = session_data["sessionId"]

    aggregated = await aggregate_question_runner_answers(session_id)
    if not aggregated:
        return {"error": "No answers found for this session"}

    session_summary = {
        "sessionId": session_id,
        "userId": session_data.get("userId"),
        "moduleName": session_data.get("moduleName", "QuestionRunner"),
        **aggregated,
    }

    result = await question_runner_answer_session_collection.insert_one(session_summary)
    saved_summary = await question_runner_answer_session_collection.find_one(
        {"_id": result.inserted_id}
    )

    if saved_summary:
        saved_summary["_id"] = str(saved_summary["_id"])

    return saved_summary


async def get_question_runner_answer_sessions():
    sessions = []
    async for session in question_runner_answer_session_collection.find():
        session["_id"] = str(session["_id"])
        sessions.append(session)
    return sessions