import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings

logger = logging.getLogger(__name__)


def create_scheduler(lock_service, instrument_manager) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()

    async def eod_lock_reset():
        count = await lock_service.reset_all_locks()
        logger.info("End-of-day lock reset: cleared %d locks", count)

        from app.instruments.manager import DeviceState

        for device_id, entry in instrument_manager.devices.items():
            if entry.state == DeviceState.LOCKED:
                instrument_manager.update_state(device_id, DeviceState.ONLINE)

    scheduler.add_job(
        eod_lock_reset,
        trigger=CronTrigger(hour=23, minute=59, timezone=settings.EOD_RESET_TIMEZONE),
        id="eod_lock_reset",
        name="End-of-day lock reset",
        replace_existing=True,
    )

    return scheduler
