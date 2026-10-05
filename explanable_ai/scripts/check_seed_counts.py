from sqlalchemy import create_engine, text

engine = create_engine("mysql+pymysql://root:@localhost:3306/explanable_ai")

queries = {
    "lessons": "SELECT COUNT(*) FROM lessons WHERE lesson_id='101'",
    "students": "SELECT COUNT(*) FROM students WHERE student_id IN ('1001','1002','1003')",
    "logs": "SELECT COUNT(*) FROM cognitive_load_logs WHERE lesson_id='101'",
    "student_explanations": "SELECT COUNT(*) FROM student_lesson_explanations WHERE lesson_id='101'",
    "class_summary": "SELECT COUNT(*) FROM class_lesson_summary WHERE lesson_id='101'",
}

with engine.connect() as conn:
    for name, query in queries.items():
        count = conn.execute(text(query)).scalar_one()
        print(name, count)
