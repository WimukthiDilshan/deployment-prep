from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "LIME AI Service"
    APP_VERSION: str = "0.1.0"
    API_PREFIX: str = "/api/v1"

    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "lime-data"

    MODEL_API_URL: str = "http://127.0.0.1:8021"
    MODEL_API_PREDICT_PATH: str = "/predict"
    MODEL_API_TIMEOUT_SECONDS: int = 30
    LOCAL_MODEL_PATH: str = "../COGNITIVE-LOAD-API/model/cognitive_load_model.pkl"

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"
    GEMINI_TIMEOUT_SECONDS: int = 180
    GEMINI_TEMPERATURE: float = 0.2
    GEMINI_MAX_OUTPUT_TOKENS: int = 512

    @property
    def SQLALCHEMY_DATABASE_URL(self) -> str:
        return (
            f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}@"
            f"{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
