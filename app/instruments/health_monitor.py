"""Background service that periodically checks device reachability and manages driver lifecycle."""

from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.core.activity import ActivityTracker
from app.instruments.manager import DeviceState, InstrumentManager

logger = logging.getLogger(__name__)


class HealthMonitor:
    """Background service that periodically checks device reachability over TCP.

    Runs as a single asyncio task that wakes every
    :attr:`~app.config.Settings.HEALTH_CHECK_INTERVAL_SECONDS` and attempts a
    TCP connection to each registered device. Based on the result and the
    device's current state it drives the following transitions:

    - ``OFFLINE`` → ``ONLINE``: device became reachable; driver is instantiated
      and :meth:`~app.instruments.base_driver.BaseOscilloscopeDriver.connect`
      is called.
    - ``ERROR`` → ``ONLINE``: device is reachable again after an error;
      reconnection is attempted.
    - ``ONLINE``/``LOCKED`` → ``OFFLINE``: device is no longer reachable; the
      driver is disconnected and the reference cleared.
    - ``BUSY``: skipped entirely so as not to interfere with active commands.

    When an :class:`~app.core.activity.ActivityTracker` is supplied, poll
    cycles are skipped while the system has been idle for longer than
    :attr:`~app.config.Settings.HEALTH_CHECK_IDLE_TIMEOUT_SECONDS`. Checks
    resume automatically on the next incoming request.
    """

    def __init__(
        self,
        manager: InstrumentManager,
        activity_tracker: ActivityTracker | None = None,
    ) -> None:
        """Initialize the HealthMonitor.

        Args:
            manager: The :class:`~app.instruments.manager.InstrumentManager`
                whose devices will be monitored.
            activity_tracker: Optional tracker used to skip poll cycles when no
                users are actively using the service. Pass ``None`` to disable
                idle detection and always poll.
        """
        self._manager = manager
        self._activity_tracker = activity_tracker
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the background health-check loop as an asyncio task."""
        self._task = asyncio.create_task(self._run(), name="health-monitor")
        logger.info(
            "HealthMonitor started (interval=%ds)",
            settings.HEALTH_CHECK_INTERVAL_SECONDS,
        )

    async def stop(self) -> None:
        """Cancel the background task and wait for it to finish."""
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self) -> None:
        """Main loop: check every device immediately, then repeat on interval.

        Runs indefinitely until cancelled. Any unexpected exception inside
        :meth:`_check_device` is caught and logged so the loop keeps running.
        The first pass runs without delay so real devices show their actual
        state as soon as the application is ready.

        When an :class:`~app.core.activity.ActivityTracker` is configured,
        poll cycles are skipped if no API request has been seen within
        :attr:`~app.config.Settings.HEALTH_CHECK_IDLE_TIMEOUT_SECONDS` seconds.
        """
        first_run = True
        while True:
            try:
                idle = (
                    not first_run
                    and self._activity_tracker is not None
                    and settings.HEALTH_CHECK_IDLE_TIMEOUT_SECONDS > 0
                    and not self._activity_tracker.is_active(
                        settings.HEALTH_CHECK_IDLE_TIMEOUT_SECONDS
                    )
                )
                first_run = False
                if idle:
                    logger.debug(
                        "HealthMonitor: idle (no activity for >%ds), skipping cycle",
                        settings.HEALTH_CHECK_IDLE_TIMEOUT_SECONDS,
                    )
                else:
                    for device_id in list(self._manager.devices.keys()):
                        await self._check_device(device_id)
                await asyncio.sleep(settings.HEALTH_CHECK_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("HealthMonitor error: %s", exc)

    async def _check_device(self, device_id: str) -> None:
        """Perform a single reachability check for one device and act on the result.

        Skips the device if it is currently ``BUSY`` so as not to race with an
        ongoing command. Transitions state and manages driver lifecycle based on
        whether the TCP connection attempt succeeds or fails.

        Args:
            device_id: Identifier of the device to check.
        """
        entry = self._manager.devices.get(device_id)
        if entry is None:
            return

        # Mock devices are always considered connected — skip health check
        if entry.config.driver_class_path == "mock":
            return

        # Skip if actively busy — don't interfere with ongoing commands
        if entry.state == DeviceState.BUSY:
            return

        reachable = await self._tcp_reachable(entry.config.ip, entry.config.port)
        logger.debug(
            "TCP check %s:%d → %s (state=%s)",
            entry.config.ip,
            entry.config.port,
            "reachable" if reachable else "unreachable",
            entry.state.value,
        )
        prev_state = entry.state

        if reachable:
            if prev_state == DeviceState.OFFLINE:
                # Transition OFFLINE → ONLINE: connect driver
                logger.info("Device %s came online; initializing driver", device_id)
                try:
                    driver = self._manager.instantiate_driver(device_id)
                    driver.connect()
                    info = driver.identify()
                    logger.info("Device %s identified: %s", device_id, info.idn)
                    self._manager.update_state(device_id, DeviceState.ONLINE)
                except Exception as exc:
                    logger.error("Failed to connect driver for %s: %s", device_id, exc)
                    entry.last_error = str(exc)
                    self._manager.update_state(device_id, DeviceState.ERROR)
            # If ONLINE/LOCKED/ERROR but now reachable and was ERROR, attempt recovery
            elif prev_state == DeviceState.ERROR:
                logger.info("Device %s reachable again; attempting recovery", device_id)
                try:
                    driver = self._manager.instantiate_driver(device_id)
                    driver.connect()
                    entry.last_error = None
                    self._manager.update_state(device_id, DeviceState.ONLINE)
                except Exception as exc:
                    logger.warning("Recovery failed for %s: %s", device_id, exc)
        else:
            if prev_state not in (DeviceState.OFFLINE,):
                logger.warning(
                    "Device %s went offline (was %s)", device_id, prev_state.value
                )
                if prev_state == DeviceState.BUSY:
                    # Mark as interrupted in buffer — handled by the command future
                    logger.warning("Device %s went offline while BUSY", device_id)
                if entry.driver:
                    try:
                        entry.driver.disconnect()
                    except Exception:
                        pass
                    entry.driver = None
                self._manager.update_state(device_id, DeviceState.OFFLINE)

    @staticmethod
    async def _tcp_reachable(ip: str, port: int, timeout: float | None = None) -> bool:
        """Attempt a TCP connection to test whether a host is reachable.

        Args:
            ip: IP address to connect to.
            port: TCP port to connect to.
            timeout: Maximum seconds to wait for the connection. Defaults to ``2.0``.

        Returns:
            ``True`` if the connection was established (and then immediately
            closed), ``False`` if it timed out or raised any exception.
        """
        effective_timeout = (
            timeout
            if timeout is not None
            else settings.HEALTH_CHECK_TCP_TIMEOUT_SECONDS
        )
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port), timeout=effective_timeout
            )
            writer.close()
            await writer.wait_closed()
            return True
        except Exception:
            return False
