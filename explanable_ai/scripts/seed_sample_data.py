from __future__ import annotations

import json

from sqlalchemy import create_engine, text

DB_URL = "mysql+pymysql://root:@localhost:3306/explanable_ai"

LESSON_ID = "101"
LESSON_NAME = "Intro to Fractions"
LESSON_DATE = "2026-04-10"

STUDENTS = [
    {"student_id": "1001", "student_name": "Ariana Perera"},
    {"student_id": "1002", "student_name": "Nimal Silva"},
    {"student_id": "1003", "student_name": "Kavindi Fernando"},
]

COGNITIVE_LOAD_LOGS = [
    # student 1001
    {"student_id": "1001", "lesson_id": LESSON_ID, "minute_index": 1, "pause_frequency": 2, "navigation_count_video": 1, "rewatch_segments": 1, "playback_rate_change": 0, "idle_duration_video": 5, "time_on_content": 46, "navigation_count_adaptation": 1, "revisit_frequency": 1, "idle_duration_adaptation": 4, "quiz_response_time": 11, "error_rate": 0.10, "predicted_cognitive_load": "Low"},
    {"student_id": "1001", "lesson_id": LESSON_ID, "minute_index": 2, "pause_frequency": 3, "navigation_count_video": 1, "rewatch_segments": 1, "playback_rate_change": 1, "idle_duration_video": 6, "time_on_content": 52, "navigation_count_adaptation": 1, "revisit_frequency": 1, "idle_duration_adaptation": 5, "quiz_response_time": 12, "error_rate": 0.15, "predicted_cognitive_load": "Medium"},
    {"student_id": "1001", "lesson_id": LESSON_ID, "minute_index": 3, "pause_frequency": 2, "navigation_count_video": 2, "rewatch_segments": 1, "playback_rate_change": 0, "idle_duration_video": 5, "time_on_content": 49, "navigation_count_adaptation": 2, "revisit_frequency": 1, "idle_duration_adaptation": 4, "quiz_response_time": 13, "error_rate": 0.10, "predicted_cognitive_load": "Low"},
    # student 1002
    {"student_id": "1002", "lesson_id": LESSON_ID, "minute_index": 1, "pause_frequency": 4, "navigation_count_video": 3, "rewatch_segments": 2, "playback_rate_change": 1, "idle_duration_video": 10, "time_on_content": 57, "navigation_count_adaptation": 2, "revisit_frequency": 2, "idle_duration_adaptation": 8, "quiz_response_time": 18, "error_rate": 0.25, "predicted_cognitive_load": "Medium"},
    {"student_id": "1002", "lesson_id": LESSON_ID, "minute_index": 2, "pause_frequency": 5, "navigation_count_video": 3, "rewatch_segments": 2, "playback_rate_change": 2, "idle_duration_video": 12, "time_on_content": 62, "navigation_count_adaptation": 3, "revisit_frequency": 2, "idle_duration_adaptation": 10, "quiz_response_time": 20, "error_rate": 0.30, "predicted_cognitive_load": "High"},
    {"student_id": "1002", "lesson_id": LESSON_ID, "minute_index": 3, "pause_frequency": 4, "navigation_count_video": 2, "rewatch_segments": 2, "playback_rate_change": 1, "idle_duration_video": 11, "time_on_content": 60, "navigation_count_adaptation": 2, "revisit_frequency": 2, "idle_duration_adaptation": 9, "quiz_response_time": 19, "error_rate": 0.28, "predicted_cognitive_load": "High"},
    # student 1003
    {"student_id": "1003", "lesson_id": LESSON_ID, "minute_index": 1, "pause_frequency": 6, "navigation_count_video": 4, "rewatch_segments": 3, "playback_rate_change": 2, "idle_duration_video": 15, "time_on_content": 66, "navigation_count_adaptation": 3, "revisit_frequency": 3, "idle_duration_adaptation": 13, "quiz_response_time": 25, "error_rate": 0.40, "predicted_cognitive_load": "High"},
    {"student_id": "1003", "lesson_id": LESSON_ID, "minute_index": 2, "pause_frequency": 7, "navigation_count_video": 5, "rewatch_segments": 3, "playback_rate_change": 2, "idle_duration_video": 18, "time_on_content": 70, "navigation_count_adaptation": 4, "revisit_frequency": 3, "idle_duration_adaptation": 14, "quiz_response_time": 27, "error_rate": 0.45, "predicted_cognitive_load": "Very High"},
    {"student_id": "1003", "lesson_id": LESSON_ID, "minute_index": 3, "pause_frequency": 6, "navigation_count_video": 4, "rewatch_segments": 3, "playback_rate_change": 3, "idle_duration_video": 16, "time_on_content": 68, "navigation_count_adaptation": 3, "revisit_frequency": 3, "idle_duration_adaptation": 12, "quiz_response_time": 26, "error_rate": 0.42, "predicted_cognitive_load": "High"},
]

STUDENT_EXPLANATIONS = [
    {
        "student_id": "1001",
        "lesson_id": LESSON_ID,
        "final_cognitive_load": "Low",
        "avg_pause_frequency": 2.3,
        "avg_navigation_count_video": 1.3,
        "avg_rewatch_segments": 1.0,
        "avg_playback_rate_change": 0.3,
        "avg_idle_duration_video": 5.3,
        "avg_time_on_content": 49.0,
        "avg_navigation_count_adaptation": 1.3,
        "avg_revisit_frequency": 1.0,
        "avg_idle_duration_adaptation": 4.3,
        "avg_quiz_response_time": 12.0,
        "avg_error_rate": 0.12,
        "very_low_count": 0,
        "low_count": 2,
        "medium_count": 1,
        "high_count": 0,
        "very_high_count": 0,
        "shap_top_factors_json": json.dumps([{"feature": "avg_quiz_response_time", "score": -0.3}, {"feature": "avg_error_rate", "score": -0.2}], ensure_ascii=False),
        "lime_top_factors_json": json.dumps([{"feature": "avg_pause_frequency", "score": -0.25}, {"feature": "avg_error_rate", "score": -0.2}], ensure_ascii=False),
        "agreed_top_factors_json": json.dumps([{"feature": "avg_error_rate", "score": -0.2}], ensure_ascii=False),
        "explanation_text": "Student shows generally low cognitive load with occasional medium spikes.",
        "recommendation_text": "Introduce slightly more challenging examples while maintaining short checks.",
    },
    {
        "student_id": "1002",
        "lesson_id": LESSON_ID,
        "final_cognitive_load": "High",
        "avg_pause_frequency": 4.3,
        "avg_navigation_count_video": 2.7,
        "avg_rewatch_segments": 2.0,
        "avg_playback_rate_change": 1.3,
        "avg_idle_duration_video": 11.0,
        "avg_time_on_content": 59.7,
        "avg_navigation_count_adaptation": 2.3,
        "avg_revisit_frequency": 2.0,
        "avg_idle_duration_adaptation": 9.0,
        "avg_quiz_response_time": 19.0,
        "avg_error_rate": 0.28,
        "very_low_count": 0,
        "low_count": 0,
        "medium_count": 1,
        "high_count": 2,
        "very_high_count": 0,
        "shap_top_factors_json": json.dumps([{"feature": "avg_error_rate", "score": 0.6}, {"feature": "avg_idle_duration_video", "score": 0.45}], ensure_ascii=False),
        "lime_top_factors_json": json.dumps([{"feature": "avg_quiz_response_time", "score": 0.5}, {"feature": "avg_error_rate", "score": 0.45}], ensure_ascii=False),
        "agreed_top_factors_json": json.dumps([{"feature": "avg_error_rate", "score": 0.5}], ensure_ascii=False),
        "explanation_text": "Student demonstrates sustained high cognitive load in adaptation and quiz phases.",
        "recommendation_text": "Chunk instructions and add worked examples before independent practice.",
    },
    {
        "student_id": "1003",
        "lesson_id": LESSON_ID,
        "final_cognitive_load": "High",
        "avg_pause_frequency": 6.3,
        "avg_navigation_count_video": 4.3,
        "avg_rewatch_segments": 3.0,
        "avg_playback_rate_change": 2.3,
        "avg_idle_duration_video": 16.3,
        "avg_time_on_content": 68.0,
        "avg_navigation_count_adaptation": 3.3,
        "avg_revisit_frequency": 3.0,
        "avg_idle_duration_adaptation": 13.0,
        "avg_quiz_response_time": 26.0,
        "avg_error_rate": 0.42,
        "very_low_count": 0,
        "low_count": 0,
        "medium_count": 0,
        "high_count": 2,
        "very_high_count": 1,
        "shap_top_factors_json": json.dumps([{"feature": "avg_idle_duration_video", "score": 0.8}, {"feature": "avg_error_rate", "score": 0.75}], ensure_ascii=False),
        "lime_top_factors_json": json.dumps([{"feature": "avg_quiz_response_time", "score": 0.7}, {"feature": "avg_error_rate", "score": 0.65}], ensure_ascii=False),
        "agreed_top_factors_json": json.dumps([{"feature": "avg_error_rate", "score": 0.7}], ensure_ascii=False),
        "explanation_text": "Student shows consistently high to very high cognitive load across the lesson.",
        "recommendation_text": "Use scaffolded practice, slower pacing, and targeted remediation.",
    },
]

CLASS_SUMMARY = {
    "lesson_id": LESSON_ID,
    "very_low_student_count": 0,
    "low_student_count": 1,
    "medium_student_count": 0,
    "high_student_count": 2,
    "very_high_student_count": 0,
    "dominant_cognitive_load": "High",
    "common_factors_json": json.dumps([
        {"feature": "avg_error_rate", "frequency": 3},
        {"feature": "avg_quiz_response_time", "frequency": 2},
        {"feature": "avg_idle_duration_video", "frequency": 2},
    ], ensure_ascii=False),
    "next_lesson_recommendation": "Start next lesson with a brief review, reduced pace, and worked examples before independent tasks.",
}


def upsert_lesson(conn) -> None:
    existing = conn.execute(
        text("SELECT id FROM lessons WHERE lesson_id = :lesson_id LIMIT 1"),
        {"lesson_id": LESSON_ID},
    ).fetchone()
    if existing:
        return
    conn.execute(
        text(
            "INSERT INTO lessons (lesson_id, lesson_name, lesson_date) "
            "VALUES (:lesson_id, :lesson_name, :lesson_date)"
        ),
        {
            "lesson_id": LESSON_ID,
            "lesson_name": LESSON_NAME,
            "lesson_date": LESSON_DATE,
        },
    )


def upsert_students(conn) -> None:
    for student in STUDENTS:
        existing = conn.execute(
            text("SELECT id FROM students WHERE student_id = :student_id LIMIT 1"),
            {"student_id": student["student_id"]},
        ).fetchone()
        if existing:
            continue
        conn.execute(
            text("INSERT INTO students (student_id, student_name) VALUES (:student_id, :student_name)"),
            student,
        )


def seed_cognitive_logs(conn) -> None:
    existing_count = conn.execute(
        text("SELECT COUNT(*) AS c FROM cognitive_load_logs WHERE lesson_id = :lesson_id"),
        {"lesson_id": LESSON_ID},
    ).scalar_one()
    if existing_count and existing_count >= 9:
        return

    conn.execute(text("DELETE FROM cognitive_load_logs WHERE lesson_id = :lesson_id"), {"lesson_id": LESSON_ID})
    for row in COGNITIVE_LOAD_LOGS:
        conn.execute(
            text(
                "INSERT INTO cognitive_load_logs ("
                "student_id, lesson_id, minute_index, pause_frequency, navigation_count_video, "
                "rewatch_segments, playback_rate_change, idle_duration_video, time_on_content, "
                "navigation_count_adaptation, revisit_frequency, idle_duration_adaptation, "
                "quiz_response_time, error_rate, predicted_cognitive_load"
                ") VALUES ("
                ":student_id, :lesson_id, :minute_index, :pause_frequency, :navigation_count_video, "
                ":rewatch_segments, :playback_rate_change, :idle_duration_video, :time_on_content, "
                ":navigation_count_adaptation, :revisit_frequency, :idle_duration_adaptation, "
                ":quiz_response_time, :error_rate, :predicted_cognitive_load"
                ")"
            ),
            row,
        )


def seed_student_explanations(conn) -> None:
    conn.execute(
        text("DELETE FROM student_lesson_explanations WHERE lesson_id = :lesson_id"),
        {"lesson_id": LESSON_ID},
    )

    for row in STUDENT_EXPLANATIONS:
        conn.execute(
            text(
                "INSERT INTO student_lesson_explanations ("
                "student_id, lesson_id, final_cognitive_load, "
                "avg_pause_frequency, avg_navigation_count_video, avg_rewatch_segments, avg_playback_rate_change, "
                "avg_idle_duration_video, avg_time_on_content, avg_navigation_count_adaptation, avg_revisit_frequency, "
                "avg_idle_duration_adaptation, avg_quiz_response_time, avg_error_rate, "
                "very_low_count, low_count, medium_count, high_count, very_high_count, "
                "shap_top_factors_json, lime_top_factors_json, agreed_top_factors_json, explanation_text, recommendation_text"
                ") VALUES ("
                ":student_id, :lesson_id, :final_cognitive_load, "
                ":avg_pause_frequency, :avg_navigation_count_video, :avg_rewatch_segments, :avg_playback_rate_change, "
                ":avg_idle_duration_video, :avg_time_on_content, :avg_navigation_count_adaptation, :avg_revisit_frequency, "
                ":avg_idle_duration_adaptation, :avg_quiz_response_time, :avg_error_rate, "
                ":very_low_count, :low_count, :medium_count, :high_count, :very_high_count, "
                ":shap_top_factors_json, :lime_top_factors_json, :agreed_top_factors_json, :explanation_text, :recommendation_text"
                ")"
            ),
            row,
        )


def seed_class_summary(conn) -> None:
    conn.execute(
        text("DELETE FROM class_lesson_summary WHERE lesson_id = :lesson_id"),
        {"lesson_id": LESSON_ID},
    )
    conn.execute(
        text(
            "INSERT INTO class_lesson_summary ("
            "lesson_id, very_low_student_count, low_student_count, medium_student_count, high_student_count, "
            "very_high_student_count, dominant_cognitive_load, common_factors_json, next_lesson_recommendation"
            ") VALUES ("
            ":lesson_id, :very_low_student_count, :low_student_count, :medium_student_count, :high_student_count, "
            ":very_high_student_count, :dominant_cognitive_load, :common_factors_json, :next_lesson_recommendation"
            ")"
        ),
        CLASS_SUMMARY,
    )


def main() -> None:
    engine = create_engine(DB_URL)
    with engine.begin() as conn:
        upsert_lesson(conn)
        upsert_students(conn)
        seed_cognitive_logs(conn)
        seed_student_explanations(conn)
        seed_class_summary(conn)

    print("Sample data seeded successfully for lesson_id=101")


if __name__ == "__main__":
    main()
