"""Task definitions for background scheduling with APScheduler."""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.instruments.manager import DeviceState

from app.config import settings
from app.scheduler.openbis_sync import sync_oscilloscopes_from_openbis

logger = logging.getLogger(__name__)


def create_scheduler(lock_service, instrument_manager) -> AsyncIOScheduler:
    """Build and return a configured :class:`~apscheduler.schedulers.asyncio.AsyncIOScheduler`.

    Registers two end-of-day cron jobs in the timezone defined by
    :attr:`~app.config.Settings.EOD_RESET_TIMEZONE`:

    - ``eod_openbis_sync`` (23:55): queries OpenBIS for EQUIPMENT objects and
      updates ``oscilloscopes.yaml``. No-op when ``OPENBIS_BOT_USER`` is empty.
    - ``eod_lock_reset`` (23:59): clears all Redis lock keys and resets any
      ``LOCKED`` devices back to ``ONLINE``.

    The caller is responsible for starting the scheduler with ``scheduler.start()``
    and stopping it with ``scheduler.shutdown()`` during application lifecycle
    management.

    Args:
        lock_service: The :class:`~app.locks.service.LockService` instance whose
            ``reset_all_locks`` method will be called by the job.
        instrument_manager: The :class:`~app.instruments.manager.InstrumentManager`
            instance used to reset device states after locks are cleared.

    Returns:
        A configured but not yet started
        :class:`~apscheduler.schedulers.asyncio.AsyncIOScheduler`.
    """
    scheduler = AsyncIOScheduler()

    async def eod_lock_reset():
        """Clear all device locks and reset LOCKED device states at end of day.

        Called by APScheduler at 23:59 every day. Deletes all ``lock:*`` keys
        from Redis and transitions every ``LOCKED`` device back to ``ONLINE``
        so they are available the next morning.
        """
        count = await lock_service.reset_all_locks()
        logger.info("End-of-day lock reset: cleared %d locks", count)

        for device_id, entry in instrument_manager.devices.items():
            if entry.state == DeviceState.LOCKED:
                instrument_manager.update_state(device_id, DeviceState.ONLINE)

    scheduler.add_job(
        sync_oscilloscopes_from_openbis,
        trigger=CronTrigger(hour=23, minute=55, timezone=settings.EOD_RESET_TIMEZONE),
        id="eod_openbis_sync",
        name="End-of-day OpenBIS oscilloscope sync",
        replace_existing=True,
        args=[settings],
    )

    scheduler.add_job(
        eod_lock_reset,
        trigger=CronTrigger(hour=23, minute=59, timezone=settings.EOD_RESET_TIMEZONE),
        id="eod_lock_reset",
        name="End-of-day lock reset",
        replace_existing=True,
    )

    return scheduler
