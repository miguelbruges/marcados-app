from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./marcados_dev.db"
    secret_key: str = "dev-only-insecure-key-change-me"
    access_token_expire_minutes: int = 480
    cors_origins: str = "http://localhost:5500"
    environment: str = "development"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
