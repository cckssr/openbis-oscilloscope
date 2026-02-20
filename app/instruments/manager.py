import asyncio
import importlib
import logging
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Coroutine

import yaml

from app.config import settings
from app.instruments.base_driver import BaseOscilloscopeDriver
from app.instruments.mock_driver import MockOscilloscopeDriver

logger = logging.getLogger(__name__)


class DeviceState(str, Enum):
    OFFLINE = "OFFLINE"
    ONLINE = "ONLINE"
    LOCKED = "LOCKED"
    BUSY = "BUSY"
    ERROR = "ERROR"


@dataclass
class DeviceConfig:
    id: str
    ip: str
    port: int
    label: str
    driver_class_path: str


@dataclass
class DeviceEntry:
    config: DeviceConfig
    state: DeviceState = DeviceState.OFFLINE
    driver: BaseOscilloscopeDriver | None = None
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    worker_task: asyncio.Task | None = None
    last_error: str | None = None


@dataclass
class DeviceStatus:
    id: str
    label: str
    ip: str
    port: int
    state: DeviceState
    last_error: str | None


def _load_driver_class(class_path: str) -> type:
    """Dynamically import a driver class by dotted path."""
    if class_path == "mock":
        return MockOscilloscopeDriver
    module_path, class_name = class_path.rsplit(".", 1)
    module = importlib.import_module(module_path)
    return getattr(module, class_name)


class InstrumentManager:
    def __init__(self) -> None:
        self.devices: dict[str, DeviceEntry] = {}

    async def startup(self) -> None:
        """Load config and start per-device worker tasks."""
        config_path = Path(settings.OSCILLOSCOPES_CONFIG)
        if not config_path.exists():
            logger.warning("Oscilloscopes config not found: %s", config_path)
            return

        with config_path.open() as f:
            raw = yaml.safe_load(f)

        for item in raw.get("oscilloscopes", []):
            driver_path = item.get("driver", "mock")

            # In DEBUG mode, always use mock driver
            if settings.DEBUG:
                driver_path = "mock"

            cfg = DeviceConfig(
                id=item["id"],
                ip=item["ip"],
                port=item.get("port", 5025),
                label=item.get("label", item["id"]),
                driver_class_path=driver_path,
            )
            entry = DeviceEntry(config=cfg)
            self.devices[cfg.id] = entry
            entry.worker_task = asyncio.create_task(
                self._device_worker(cfg.id), name=f"worker-{cfg.id}"
            )
            logger.info("Registered device: %s (%s)", cfg.id, cfg.label)

    async def shutdown(self) -> None:
        """Cancel all worker tasks and disconnect drivers."""
        for device_id, entry in self.devices.items():
            if entry.worker_task:
                entry.worker_task.cancel()
                try:
                    await entry.worker_task
                except asyncio.CancelledError:
                    pass
            if entry.driver:
                try:
                    entry.driver.disconnect()
                except Exception as exc:
                    logger.warning("Error disconnecting %s: %s", device_id, exc)

    async def _device_worker(self, device_id: str) -> None:
        """Pull callables from the device queue and execute them serially."""
        entry = self.devices[device_id]
        while True:
            try:
                coro_fn, future = await entry.queue.get()
                prev_state = entry.state
                entry.state = DeviceState.BUSY
                try:
                    result = await coro_fn()
                    if not future.done():
                        future.set_result(result)
                except Exception as exc:
                    entry.last_error = str(exc)
                    entry.state = DeviceState.ERROR
                    if not future.done():
                        future.set_exception(exc)
                    continue
                finally:
                    entry.queue.task_done()

                # Restore to LOCKED or ONLINE depending on prior state
                if entry.state == DeviceState.BUSY:
                    entry.state = prev_state if prev_state in (
                        DeviceState.LOCKED, DeviceState.ONLINE
                    ) else DeviceState.ONLINE

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Unexpected error in worker for %s: %s", device_id, exc)

    async def execute_command(
        self,
        device_id: str,
        coro_fn: Callable[[], Coroutine[Any, Any, Any]],
        timeout: float = 30.0,
    ) -> Any:
        """
        Queue a coroutine for execution on the device worker.
        Returns result or raises on timeout/error.
        """
        entry = self.devices.get(device_id)
        if entry is None:
            raise KeyError(f"Unknown device: {device_id}")

        loop = asyncio.get_event_loop()
        future: asyncio.Future = loop.create_future()
        await entry.queue.put((coro_fn, future))

        try:
            return await asyncio.wait_for(asyncio.shield(future), timeout=timeout)
        except asyncio.TimeoutError:
            entry.state = DeviceState.ERROR
            entry.last_error = "Command timed out"
            raise

    def get_device_list(self) -> list[DeviceStatus]:
        return [
            DeviceStatus(
                id=e.config.id,
                label=e.config.label,
                ip=e.config.ip,
                port=e.config.port,
                state=e.state,
                last_error=e.last_error,
            )
            for e in self.devices.values()
        ]

    def get_device(self, device_id: str) -> DeviceEntry:
        entry = self.devices.get(device_id)
        if entry is None:
            raise KeyError(f"Unknown device: {device_id}")
        return entry

    def update_state(self, device_id: str, state: DeviceState) -> None:
        if device_id in self.devices:
            self.devices[device_id].state = state

    def instantiate_driver(self, device_id: str) -> BaseOscilloscopeDriver:
        """Create and return a new driver instance for the device."""
        entry = self.devices[device_id]
        driver_class = _load_driver_class(entry.config.driver_class_path)
        driver = driver_class(ip=entry.config.ip, port=entry.config.port)
        entry.driver = driver
        return driver


instrument_manager = InstrumentManager()
