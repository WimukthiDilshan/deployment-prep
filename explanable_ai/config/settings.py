from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    APP_NAME: str = "Explainable AI Module Backend"
    APP_VERSION: str = "0.1.0"
    API_PREFIX: str = "/api/v1"
    GPT_API_KEY: str = ""
    GPT_MODEL: str = "gpt-4o-mini"
    GPT_TIMEOUT_SECONDS: int = 20
    DB_HOST: str = "localhost"
    USER: str = "root"
    PASSWORD: str = ""
    DB_NAME: str = "explanable_ai"
    DB_PORT: int = 3306
    # External prediction microservice used as the black-box model for SHAP/LIME.
    EXPLAINABILITY_MICROSERVICE_URL: str = ""
    # Path on the microservice that returns cognitive load predictions.
    EXPLAINABILITY_MICROSERVICE_PATH: str = "/predict"
    # Timeout for the remote microservice call in seconds.
    EXPLAINABILITY_MICROSERVICE_TIMEOUT_SECONDS: int = 30

    @property
    def SQLALCHEMY_DATABASE_URL(self) -> str:
        """Build the SQLAlchemy connection string for MySQL."""
        return (
            f"mysql+pymysql://{self.USER}:{self.PASSWORD}@"
            f"{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
