"""Public runtime configuration endpoint consumed by the frontend before login."""

from importlib import metadata

from fastapi import APIRouter

from app.config import settings
from app.scheduler.tasks import EOD_LOCK_RESET_HOUR, EOD_LOCK_RESET_MINUTE

router = APIRouter(tags=["config"])


def _app_version() -> str:
    """Return the installed backend package version, or ``"dev"`` if unknown.

    Returns:
        The version string from the package metadata of
        ``openbis-oscilloscope-backend``, or ``"dev"`` when the package is not
        installed (e.g. when running from a plain checkout).
    """
    try:
        return metadata.version("openbis-oscilloscope-backend")
    except metadata.PackageNotFoundError:
        return "dev"


@router.get(
    "/config",
    response_model=dict,
    summary="Get public app configuration",
    response_description="Runtime settings the frontend needs (no authentication).",
)
async def get_app_config() -> dict:
    """Return non-sensitive runtime configuration for the frontend.

    This endpoint is intentionally unauthenticated so the login page can show
    the version and the openBIS link before a token exists. It never exposes
    credentials or internal paths.

    Returns:
        A dict with ``debug``, ``version``, ``openbis_url``, ``lab_courses``
        (list of ``{value, label}``), ``lock_ttl_seconds``,
        ``lock_soft_release_seconds``, ``eod_reset_time`` (``"HH:MM"``) and
        ``eod_timezone``.
    """
    return {
        "debug": settings.DEBUG,
        "version": _app_version(),
        "openbis_url": settings.OPENBIS_URL,
        "lab_courses": settings.LAB_COURSES,
        "lock_ttl_seconds": settings.LOCK_TTL_SECONDS,
        "lock_soft_release_seconds": settings.LOCK_SOFT_RELEASE_SECONDS,
        "eod_reset_time": f"{EOD_LOCK_RESET_HOUR:02d}:{EOD_LOCK_RESET_MINUTE:02d}",
        "eod_timezone": settings.EOD_RESET_TIMEZONE,
    }
