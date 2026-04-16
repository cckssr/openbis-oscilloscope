"""Application configuration using Pydantic for environment variable management."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or a ``.env`` file.

    All fields can be overridden by setting the corresponding environment
    variable (case-insensitive). A ``.env`` file in the working directory is
    read automatically when present.

    Attributes:
        REDIS_URL: Connection URL for the Redis instance used by the lock service.
        OPENBIS_URL: Base URL of the OpenBIS server (required in production).
        BUFFER_DIR: Root directory where artifact files (CSV, PNG, HDF5) are stored.
        OSCILLOSCOPES_CONFIG: Path to the YAML file listing registered oscilloscopes.
        LOCK_TTL_SECONDS: Seconds after which an unrenewed device lock expires.
        HEALTH_CHECK_INTERVAL_SECONDS: Interval in seconds between TCP reachability checks.
        HEALTH_CHECK_TCP_TIMEOUT_SECONDS: Seconds to wait for a TCP connection during a health check.
        TOKEN_CACHE_SECONDS: How long a validated OpenBIS session token is cached in memory.
        EOD_RESET_TIMEZONE: IANA timezone name used for the end-of-day lock-reset cron job.
        DEBUG: When ``True``, mock drivers are used and Redis is replaced with an in-memory
            fake, so the service starts without any external dependencies.
        DEBUG_TOKEN: A fixed Bearer token accepted in ``DEBUG`` mode that bypasses OpenBIS
            validation. Ignored when ``DEBUG`` is ``False``.
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    REDIS_URL: str = "redis://localhost:6379"
    OPENBIS_URL: str = ""
    BUFFER_DIR: str = "./buffer"
    OSCILLOSCOPES_CONFIG: str = "./config/oscilloscopes.yaml"
    LOCK_TTL_SECONDS: int = 1800
    HEALTH_CHECK_INTERVAL_SECONDS: int = 20
    HEALTH_CHECK_TCP_TIMEOUT_SECONDS: float = 2.0
    TOKEN_CACHE_SECONDS: int = 60
    EOD_RESET_TIMEZONE: str = "Europe/Berlin"
    DEBUG: bool = False
    DEBUG_TOKEN: str = "debug-token"


settings = Settings()
