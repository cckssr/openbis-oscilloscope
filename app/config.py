from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    REDIS_URL: str = "redis://localhost:6379"
    OPENBIS_URL: str = ""
    BUFFER_DIR: str = "./buffer"
    OSCILLOSCOPES_CONFIG: str = "./config/oscilloscopes.yaml"
    LOCK_TTL_SECONDS: int = 1800
    HEALTH_CHECK_INTERVAL_SECONDS: int = 5
    TOKEN_CACHE_SECONDS: int = 60
    EOD_RESET_TIMEZONE: str = "Europe/Berlin"
    DEBUG: bool = False


settings = Settings()
