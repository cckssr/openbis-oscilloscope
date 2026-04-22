"""Main application module for the OpenBIS Oscilloscope Control Service."""

import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, Request

from app.api import admin, auth, devices, openbis_structure, sessions
from app.buffer.service import BufferService
from app.config import settings
from app.core.activity import ActivityTracker
from app.core.exceptions import register_exception_handlers
from app.instruments.health_monitor import HealthMonitor
from app.instruments.manager import DeviceState, InstrumentManager
from app.locks.service import LockService
from app.openbis_client.client import OpenBISClient
from app.scheduler.tasks import create_scheduler

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage the full startup and shutdown lifecycle of the application.

    This async context manager is passed to FastAPI and is executed once when
    the server starts (before the first request) and once when it shuts down.

    Startup order:
        1. Connect to Redis (or create an in-memory fake in ``DEBUG`` mode).
        2. Instantiate core services: :class:`~app.locks.service.LockService`,
           :class:`~app.instruments.manager.InstrumentManager`,
           :class:`~app.buffer.service.BufferService`,
           :class:`~app.openbis_client.client.OpenBISClient`.
        3. Load device config and start per-device worker tasks.
        4. In ``DEBUG`` mode: immediately connect mock drivers so devices
           appear as ``ONLINE`` without the health monitor.
        5. Start :class:`~app.instruments.health_monitor.HealthMonitor`
           (skipped in ``DEBUG`` mode).
        6. Start the APScheduler end-of-day cron job.
        7. Attach all service instances to ``app.state`` for dependency access.

    Shutdown order (reverse):
        Scheduler → HealthMonitor → InstrumentManager → Redis connection.

    Args:
        app: The FastAPI application instance whose ``state`` is populated
             with service references during startup.

    Yields:
        Control to FastAPI for request handling after startup completes.
    """
    # ---- Startup --------------------------------------------------------
    logger.info("Starting openbis-oscilloscope service (DEBUG=%s)", settings.DEBUG)

    # Redis
    if settings.DEBUG:
        import fakeredis.aioredis as fakeredis  # pylint: disable=import-outside-toplevel

        redis_client = fakeredis.FakeRedis()
        logger.info("Using in-memory fake Redis (DEBUG mode, no Redis required)")
    else:
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=False)
        await redis_client.ping()
        logger.info("Connected to Redis: %s", settings.REDIS_URL)

    # Core services
    lock_service = LockService(redis_client)
    instrument_manager = InstrumentManager()
    buffer_service = BufferService()
    openbis_client = OpenBISClient()

    await instrument_manager.startup()

    # Pre-connect mock devices immediately (they have no real network endpoint,
    # so the health monitor skips them; we set them ONLINE here instead).
    for device_id, entry in instrument_manager.devices.items():
        if entry.config.driver_class_path == "mock":
            try:
                driver = instrument_manager.instantiate_driver(device_id)
                driver.connect()
                instrument_manager.update_state(device_id, DeviceState.ONLINE)
                logger.info("Mock device %s connected", device_id)
            except Exception as exc:
                logger.error("Failed to init mock device %s: %s", device_id, exc)

    # Activity tracker — updated by middleware on every non-health request so
    # the health monitor can skip cycles when no users are active.
    activity_tracker = ActivityTracker()

    # Health monitor — always started; skips mock devices internally.
    # Real devices are checked via TCP even in DEBUG mode so their state
    # reflects actual hardware reachability.
    health_monitor = HealthMonitor(instrument_manager, activity_tracker)
    await health_monitor.start()

    # Scheduler
    scheduler = create_scheduler(lock_service, instrument_manager)
    scheduler.start()
    logger.info("Scheduler started")

    # Attach to app state
    app.state.redis = redis_client
    app.state.lock_service = lock_service
    app.state.instrument_manager = instrument_manager
    app.state.buffer_service = buffer_service
    app.state.openbis_client = openbis_client
    app.state.health_monitor = health_monitor
    app.state.activity_tracker = activity_tracker
    app.state.scheduler = scheduler

    yield

    # ---- Shutdown -------------------------------------------------------
    logger.info("Shutting down...")
    scheduler.shutdown(wait=False)
    await health_monitor.stop()
    await instrument_manager.shutdown()
    await redis_client.aclose()
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance.

    Constructs the :class:`~fastapi.FastAPI` app with the :func:`lifespan`
    context manager, registers the global :class:`~app.core.exceptions.AppError`
    exception handler, and mounts all API routers under their respective prefixes:

    - ``/auth`` — authentication endpoints
    - ``/devices`` — device control endpoints
    - ``/sessions`` — session and artifact management
    - ``/admin`` — admin-only operations
    - ``/health`` — simple liveness probe

    Returns:
        A fully configured :class:`~fastapi.FastAPI` instance ready to be
        served by an ASGI server such as Uvicorn.
    """
    app = FastAPI(
        title="OpenBIS Oscilloscope Control Service",
        description="REST API for controlling LAN-connected oscilloscopes and storing "
        "acquisitions in OpenBIS",
        version="0.1.0",
        lifespan=lifespan,
    )

    register_exception_handlers(app)

    @app.middleware("http")
    async def _record_activity(request: Request, call_next):
        tracker = getattr(request.app.state, "activity_tracker", None)
        if tracker is not None and request.url.path != "/health":
            tracker.record()
        return await call_next(request)

    app.include_router(auth.router)
    app.include_router(devices.router)
    app.include_router(sessions.router)
    app.include_router(admin.router)
    app.include_router(openbis_structure.router)

    @app.get("/health")
    async def health_check():
        """Liveness probe endpoint.

        Returns:
            A JSON object ``{"status": "ok"}`` when the application is running.
        """
        return {"status": "ok"}

    return app


app = create_app()
