from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from config.settings import settings


Base = declarative_base()
engine = None
SessionLocal = None


def get_engine():
    global engine, SessionLocal
    if engine is None:
        admin_url = f"mysql+pymysql://{settings.DB_USER}:{settings.DB_PASSWORD}@{settings.DB_HOST}:{settings.DB_PORT}/"
        admin_engine = create_engine(admin_url, pool_pre_ping=True)
        try:
            with admin_engine.begin() as connection:
                connection.execute(text(f"CREATE DATABASE IF NOT EXISTS `{settings.DB_NAME}`"))
        finally:
            admin_engine.dispose()
        engine = create_engine(settings.SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine


def init_db() -> None:
    from models.analysis import CognitiveStyleAnalysis  # noqa: F401

    db_engine = get_engine()
    Base.metadata.create_all(bind=db_engine)
    inspector = inspect(db_engine)
    columns = {column["name"]: column for column in inspector.get_columns("cognitive-style-analysis")}

    with db_engine.begin() as connection:
        if "source_fingerprint" not in columns:
            connection.execute(
                text("ALTER TABLE `cognitive-style-analysis` ADD COLUMN `source_fingerprint` VARCHAR(64) NULL")
            )
        if "analysis_status" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE `cognitive-style-analysis` "
                    "ADD COLUMN `analysis_status` ENUM('pending','completed') NOT NULL DEFAULT 'pending'"
                )
            )
            connection.execute(
                text(
                    "UPDATE `cognitive-style-analysis` SET analysis_status='completed' "
                    "WHERE lime_output IS NOT NULL AND shap_output IS NOT NULL AND top_features IS NOT NULL"
                )
            )
        connection.execute(
            text(
                "UPDATE `cognitive-style-analysis` "
                "SET analysis_status = CASE "
                "WHEN lime_output IS NOT NULL AND shap_output IS NOT NULL AND top_features IS NOT NULL "
                "THEN 'completed' ELSE 'pending' END "
                "WHERE analysis_status IS NULL OR analysis_status NOT IN ('pending', 'completed')"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE `cognitive-style-analysis` "
                "MODIFY COLUMN `analysis_status` "
                "ENUM('pending','completed') NOT NULL DEFAULT 'pending'"
            )
        )
        if "updated_at" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE `cognitive-style-analysis` ADD COLUMN `updated_at` DATETIME NOT NULL "
                    "DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
                )
            )
        if "explanation_prompt" not in columns:
            connection.execute(
                text("ALTER TABLE `cognitive-style-analysis` ADD COLUMN `explanation_prompt` TEXT NULL")
            )
        if "human_explanation" not in columns:
            connection.execute(
                text("ALTER TABLE `cognitive-style-analysis` ADD COLUMN `human_explanation` TEXT NULL")
            )
        if "explanation_model" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE `cognitive-style-analysis` "
                    "ADD COLUMN `explanation_model` VARCHAR(100) NULL"
                )
            )
        if "model_signature" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE `cognitive-style-analysis` "
                    "ADD COLUMN `model_signature` VARCHAR(64) NULL"
                )
            )

        nullable_columns = {
            "lesson_id": "VARCHAR(100)",
            "cognitive_style": "VARCHAR(50)",
            "confidence": "FLOAT",
            "lime_output": "JSON",
            "shap_output": "JSON",
            "top_features": "JSON",
        }
        for column_name, sql_type in nullable_columns.items():
            if not columns[column_name]["nullable"]:
                connection.execute(
                    text(
                        f"ALTER TABLE `cognitive-style-analysis` "
                        f"MODIFY COLUMN `{column_name}` {sql_type} NULL"
                    )
                )

    indexes = {index["name"] for index in inspect(db_engine).get_indexes("cognitive-style-analysis")}
    with db_engine.begin() as connection:
        if "uq_style_source_fingerprint" not in indexes and "ix_cognitive-style-analysis_source_fingerprint" not in indexes:
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX `uq_style_source_fingerprint` "
                    "ON `cognitive-style-analysis` (`source_fingerprint`)"
                )
            )
        if "idx_style_status" not in indexes and "ix_cognitive-style-analysis_analysis_status" not in indexes:
            connection.execute(
                text(
                    "CREATE INDEX `idx_style_status` "
                    "ON `cognitive-style-analysis` (`analysis_status`)"
                )
            )


def get_db() -> Generator[Session, None, None]:
    if SessionLocal is None:
        get_engine()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
