import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI

from app.api import admin, auth, devices, sessions
from app.buffer.service import BufferService
from app.config import settings
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
    # ---- Startup --------------------------------------------------------
    logger.info("Starting openbis-oscilloscope service (DEBUG=%s)", settings.DEBUG)

    # Redis
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=False)
    await redis_client.ping()
    logger.info("Connected to Redis: %s", settings.REDIS_URL)

    # Core services
    lock_service = LockService(redis_client)
    instrument_manager = InstrumentManager()
    buffer_service = BufferService()
    openbis_client = OpenBISClient()

    # In DEBUG mode pre-connect mock drivers
    if settings.DEBUG:
        await instrument_manager.startup()
        for device_id, entry in instrument_manager.devices.items():
            try:
                driver = instrument_manager.instantiate_driver(device_id)
                driver.connect()
                instrument_manager.update_state(device_id, DeviceState.ONLINE)
                logger.info("Mock device %s connected", device_id)
            except Exception as exc:
                logger.error("Failed to init mock device %s: %s", device_id, exc)
    else:
        await instrument_manager.startup()

    # Health monitor
    health_monitor = HealthMonitor(instrument_manager)
    if not settings.DEBUG:
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
    app = FastAPI(
        title="OpenBIS Oscilloscope Control Service",
        description="REST API for controlling LAN-connected oscilloscopes and storing acquisitions in OpenBIS",
        version="0.1.0",
        lifespan=lifespan,
    )

    register_exception_handlers(app)

    app.include_router(auth.router)
    app.include_router(devices.router)
    app.include_router(sessions.router)
    app.include_router(admin.router)

    @app.get("/health")
    async def health_check():
        return {"status": "ok"}

    return app


app = create_app()
