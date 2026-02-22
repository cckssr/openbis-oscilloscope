import asyncio
import logging

from app.config import settings
from app.instruments.manager import DeviceState, InstrumentManager

logger = logging.getLogger(__name__)


class HealthMonitor:
    def __init__(self, manager: InstrumentManager) -> None:
        self._manager = manager
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="health-monitor")
        logger.info(
            "HealthMonitor started (interval=%ds)",
            settings.HEALTH_CHECK_INTERVAL_SECONDS,
        )

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self) -> None:
        while True:
            try:
                await asyncio.sleep(settings.HEALTH_CHECK_INTERVAL_SECONDS)
                for device_id in list(self._manager.devices.keys()):
                    await self._check_device(device_id)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("HealthMonitor error: %s", exc)

    async def _check_device(self, device_id: str) -> None:
        entry = self._manager.devices.get(device_id)
        if entry is None:
            return

        # Skip if actively busy — don't interfere with ongoing commands
        if entry.state == DeviceState.BUSY:
            return

        reachable = await self._tcp_reachable(entry.config.ip, entry.config.port)
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
    async def _tcp_reachable(ip: str, port: int, timeout: float = 2.0) -> bool:
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port), timeout=timeout
            )
            writer.close()
            await writer.wait_closed()
            return True
        except Exception:
            return False
