"""Application configuration using Pydantic for environment variable management."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent.parent / ".env"


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
        HEALTH_CHECK_IDLE_TIMEOUT_SECONDS: Seconds of API inactivity after which health-check cycles
            are paused. Checks resume automatically on the next incoming request.
        TOKEN_CACHE_SECONDS: How long a validated OpenBIS session token is cached in memory.
        EOD_RESET_TIMEZONE: IANA timezone name used for the end-of-day lock-reset cron job.
        OPENBIS_SPACE: OpenBIS space code queried by the structure endpoints (e.g. ``"GP_2025_WISE"``).
        DEBUG: When ``True``, mock drivers are used and Redis is replaced with an in-memory
            fake, so the service starts without any external dependencies.
        LOG_LEVEL: Logging level for the application (e.g. ``"DEBUG"``, ``"INFO"``, ``"WARNING"``).
        DEBUG_TOKEN: A fixed Bearer token accepted in ``DEBUG`` mode that bypasses OpenBIS
            validation. Ignored when ``DEBUG`` is ``False``.
        OPENBIS_BOT_USER: OpenBIS username for the nightly sync bot. Leave empty to skip
            the sync job entirely (safe in development).
        OPENBIS_BOT_PASSWORD: Password for ``OPENBIS_BOT_USER``.
        DRIVER_MAPPING_CONFIG: Path to the YAML file that maps ``EQUIPMENT.ALTERNATIV_NAME``
            values to driver class paths and VXI-11 port numbers.
        OPENBIS_EQUIPMENT_IP_FILTER: IP address pattern used to filter EQUIPMENT objects
            from OpenBIS. Supports a trailing ``.*`` wildcard (e.g. ``"141.23.109.*"``).
        OPENBIS_DATASET_TYPE: OpenBIS dataset type code used when committing artifacts.
            Must match a dataset type defined in the target OpenBIS instance.
    """

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE, env_file_encoding="utf-8", extra="ignore"
    )

    REDIS_URL: str = "redis://localhost:6379"
    OPENBIS_URL: str = ""
    BUFFER_DIR: str = "./buffer"
    OSCILLOSCOPES_CONFIG: str = "./config/oscilloscopes.yaml"
    LOCK_TTL_SECONDS: int = 1800
    HEALTH_CHECK_INTERVAL_SECONDS: int = 20
    HEALTH_CHECK_TCP_TIMEOUT_SECONDS: float = 2.0
    HEALTH_CHECK_IDLE_TIMEOUT_SECONDS: int = 600
    TOKEN_CACHE_SECONDS: int = 60
    EOD_RESET_TIMEZONE: str = "Europe/Berlin"
    OPENBIS_SPACE: str = "GP_2025_WISE"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    DEBUG_TOKEN: str = "debug-token"
    OPENBIS_BOT_USER: str = ""
    OPENBIS_BOT_PASSWORD: str = ""
    DRIVER_MAPPING_CONFIG: str = "./config/driver_mapping.yaml"
    OPENBIS_EQUIPMENT_IP_FILTER: str = "141.23.109.*"
    OPENBIS_DATASET_TYPE: str = "OSCILLOSCOPE"


settings = Settings()
