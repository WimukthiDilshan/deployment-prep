from pymongo import AsyncMongoClient
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import os

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")

client = AsyncMongoClient(MONGO_URL)

db = client["cognitive_style_db"]
user_collection = db["users"]
userdb = client["userdb"]


visual_verbal_cursor_collection = db["visual_verbal_cursor_collection"]
visual_verbal_cursor_session_collection = db["visual_verbal_cursor_session_collection"]
visual_verbal_gaze_collection = db["visual_verbal_gaze_collection"]
visual_verbal_gaze_session_collection = db["visual_verbal_gaze_session_collection"]


question_runner_gaze_event_collection = db["question_runner_gaze_events"]
question_runner_gaze_session_collection = db["question_runner_gaze_sessions"]
question_runner_cursor_event_collection = db["question_runner_cursor_events"]
question_runner_cursor_session_collection = db["question_runner_cursor_sessions"]


question_runner_answer_collection = db["question_runner_answers"]
question_runner_answer_session_collection = db["question_runner_answer_sessions"]

assist_question_collection = db["assist_questions"]
vvq_collection = db["vvq_collection"]

analytic_wholistic_behavioral_data = db["analytic_wholistic_behavioral_data"]
analytic_wholistic_test_answers = db["analytic_wholistic_test_answers"]


ahs_question_collection = db["ahs_questions"]
student_collection = userdb["students"]