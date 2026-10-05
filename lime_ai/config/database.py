from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from config.settings import settings


engine = None
SessionLocal = None
Base = declarative_base()


def _admin_database_url() -> str:
    return (
        f"mysql+pymysql://{settings.DB_USER}:{settings.DB_PASSWORD}@"
        f"{settings.DB_HOST}:{settings.DB_PORT}/"
    )


def get_engine():
    global engine, SessionLocal

    if engine is None:
        admin_engine = create_engine(_admin_database_url(), pool_pre_ping=True)

        try:
            with admin_engine.begin() as connection:
                connection.execute(text(f"CREATE DATABASE IF NOT EXISTS `{settings.DB_NAME}`"))
        finally:
            admin_engine.dispose()

        engine = create_engine(
            settings.SQLALCHEMY_DATABASE_URL,
            pool_pre_ping=True,
        )
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    return engine


def init_db() -> None:
    from models.prediction import CognitiveLoadPrediction  # noqa: F401
    from models.student_lesson_summary import StudentLessonSummary  # noqa: F401
    from models.student_lesson_top_signals import StudentLessonTopSignals  # noqa: F401

    db_engine = get_engine()
    Base.metadata.create_all(bind=db_engine)

    # create_all() does not add columns to an existing table. Keep current
    # installations compatible as analysis-cache fields are introduced.
    table_name = "student-lesson-top-signals"
    column_names = {column["name"] for column in inspect(db_engine).get_columns(table_name)}
    migrations = {
        "predicted_cognitive_load": (
            "predicted_cognitive_load VARCHAR(20) NOT NULL DEFAULT 'Unknown' AFTER prediction_id"
        ),
        "predicted_score": "predicted_score INT NULL AFTER predicted_cognitive_load",
        "confidence": "confidence FLOAT NULL AFTER predicted_score",
        "lime_explanation": "lime_explanation JSON NULL AFTER top_3_normalized_value",
        "shap_explanation": "shap_explanation JSON NULL AFTER lime_explanation",
        "human_explanation": "human_explanation TEXT NULL AFTER shap_explanation",
        "explanation_source": "explanation_source VARCHAR(30) NULL AFTER human_explanation",
        "study_technique": "study_technique JSON NULL AFTER explanation_source",
        "lecture_support": "lecture_support JSON NULL AFTER study_technique",
        "shared_to_student": "shared_to_student BOOLEAN NOT NULL DEFAULT FALSE AFTER lecture_support",
        "shared_at": "shared_at DATETIME NULL AFTER shared_to_student",
    }
    missing_columns = [name for name in migrations if name not in column_names]
    if missing_columns:
        with db_engine.begin() as connection:
            for column_name in missing_columns:
                definition = migrations[column_name]
                connection.execute(
                    text(
                        "ALTER TABLE `student-lesson-top-signals` "
                        f"ADD COLUMN {definition}"
                    )
                )


def get_db() -> Generator[Session, None, None]:
    session_factory = SessionLocal
    if session_factory is None:
        get_engine()
        session_factory = SessionLocal

    db = session_factory()
    try:
        yield db
    finally:
        db.close()
