"""Manager for oscilloscope devices, handling configuration, state, and command dispatch."""

import asyncio
import importlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Coroutine

import yaml

from app.config import settings
from app.instruments.base_driver import BaseOscilloscopeDriver
from app.instruments.mock_driver import MockOscilloscopeDriver

logger = logging.getLogger(__name__)


class DeviceState(str, Enum):
    """Lifecycle state of a managed oscilloscope device.

    Attributes:
        OFFLINE: Device is not reachable over the network.
        ONLINE: Device is reachable and idle (no lock held).
        LOCKED: A user holds the exclusive control lock.
        BUSY: A command is currently being executed on the device worker.
        ERROR: The last operation failed; the device may need recovery.
    """

    OFFLINE = "OFFLINE"
    ONLINE = "ONLINE"
    LOCKED = "LOCKED"
    BUSY = "BUSY"
    ERROR = "ERROR"


@dataclass
class DeviceConfig:
    """Static configuration for a single oscilloscope, loaded from YAML.

    Attributes:
        id: Unique identifier string (e.g. ``"scope-01"``).
        ip: IP address of the instrument.
        port: TCP port number (default ``5025``).
        label: Human-readable display name.
        driver_class_path: Dotted import path of the driver class
            (e.g. ``"drivers.my_oscilloscope.MyOscilloscope"``), or the
            special value ``"mock"`` to use the built-in mock driver.
    """

    id: str
    ip: str
    port: int
    label: str
    driver_class_path: str


@dataclass
class DeviceEntry:
    """Runtime state for a registered device, combining config and live objects.

    Attributes:
        config: Static device configuration loaded from YAML.
        state: Current :class:`DeviceState` of the device.
        driver: Active driver instance, or ``None`` if disconnected.
        queue: Asyncio queue used to serialise commands to the device worker.
        worker_task: The asyncio ``Task`` running :meth:`InstrumentManager._device_worker`.
        last_error: String description of the most recent error, or ``None``.
    """

    config: DeviceConfig
    state: DeviceState = DeviceState.OFFLINE
    driver: BaseOscilloscopeDriver | None = None
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    worker_task: asyncio.Task | None = None
    last_error: str | None = None
    online_since: datetime | None = None  # set when device transitions to ONLINE


@dataclass
class DeviceStatus:
    """Serialisable status summary of a device for API responses.

    Attributes:
        id: Unique device identifier.
        label: Human-readable display name.
        ip: IP address of the instrument.
        port: TCP port number.
        state: Current :class:`DeviceState`.
        last_error: Description of the most recent error, or ``None``.
        online_since_utc: ISO-8601 UTC timestamp when the device last came ONLINE, or ``None``.
        uptime_minutes: Minutes the device has been continuously ONLINE, or ``None``.
    """

    id: str
    label: str
    ip: str
    port: int
    state: DeviceState
    last_error: str | None
    online_since_utc: str | None = None
    uptime_minutes: float | None = None


def _load_driver_class(class_path: str) -> type:
    """Dynamically import and return a driver class by its dotted module path.

    Args:
        class_path: Dotted import path of the driver class
            (e.g. ``"drivers.my_oscilloscope.MyOscilloscope"``), or the
            special value ``"mock"`` to return :class:`MockOscilloscopeDriver`.

    Returns:
        The driver class (not an instance).

    Raises:
        ImportError: If the module cannot be imported.
        AttributeError: If the class does not exist in the module.
    """
    if class_path == "mock":
        return MockOscilloscopeDriver
    module_path, class_name = class_path.rsplit(".", 1)
    module = importlib.import_module(module_path)
    return getattr(module, class_name)


class InstrumentManager:
    """Manages the lifecycle and command dispatch for all registered oscilloscopes.

    Each device gets a dedicated asyncio worker task that pulls callables from a
    per-device queue and executes them serially, ensuring commands on a single
    device never interleave. Devices run in parallel with one another.

    Device configuration is loaded from the YAML file pointed to by
    :attr:`~app.config.Settings.OSCILLOSCOPES_CONFIG`. In ``DEBUG`` mode all
    devices are forced to use :class:`~app.instruments.mock_driver.MockOscilloscopeDriver`.

    Attributes:
        devices: Mapping from device ID string to its :class:`DeviceEntry`.
    """

    def __init__(self) -> None:
        """Initialize the manager with an empty device registry."""
        self.devices: dict[str, DeviceEntry] = {}

    async def startup(self) -> None:
        """Load device configuration from YAML and start per-device worker tasks.

        Reads :attr:`~app.config.Settings.OSCILLOSCOPES_CONFIG`, creates a
        :class:`DeviceEntry` for each oscilloscope, and spawns an asyncio task
        running :meth:`_device_worker` for each device. In ``DEBUG`` mode the
        driver path is overridden to ``"mock"`` for every device.

        If the config file does not exist, a warning is logged and the method
        returns without registering any devices.
        """
        config_path = Path(settings.OSCILLOSCOPES_CONFIG)
        if not config_path.exists():
            logger.warning("Oscilloscopes config not found: %s", config_path)
            return

        with config_path.open(encoding="utf-8") as f:
            raw = yaml.safe_load(f)

        for item in raw.get("oscilloscopes", []):
            driver_path = item.get("driver", "mock")

            if driver_path == "mock" and not settings.DEBUG:
                logger.warning(
                    "Skipping device %s with mock driver in non-DEBUG mode",
                    item.get("id", "<unknown>"),
                )
                continue

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
        """Cancel all worker tasks and disconnect all active drivers.

        Gracefully cancels each device's asyncio worker task and waits for it
        to finish. Then calls ``disconnect()`` on any driver that is still
        connected, logging a warning if disconnection raises an exception.
        """
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
        """Continuously pull and execute commands from the device's queue.

        This coroutine runs as a dedicated asyncio task for each device. It
        processes ``(coro_fn, future)`` tuples from the queue one at a time,
        ensuring serial execution. The device state transitions through
        ``BUSY`` while a command runs and is restored to ``LOCKED`` or
        ``ONLINE`` on success, or set to ``ERROR`` on failure.

        Args:
            device_id: Identifier of the device this worker is responsible for.
        """
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
                    entry.state = (
                        prev_state
                        if prev_state in (DeviceState.LOCKED, DeviceState.ONLINE)
                        else DeviceState.ONLINE
                    )

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
        """Queue a coroutine for serial execution on a device's worker task.

        Places the coroutine function on the device's queue and waits for the
        result, up to ``timeout`` seconds. Commands for the same device are
        always serialised; commands for different devices run concurrently.

        Args:
            device_id: Identifier of the target device.
            coro_fn: A zero-argument async callable that performs the instrument
                operation and returns its result.
            timeout: Maximum number of seconds to wait for the command to complete.
                Defaults to ``30.0``.

        Returns:
            Whatever ``coro_fn()`` returns.

        Raises:
            KeyError: If ``device_id`` is not registered.
            asyncio.TimeoutError: If the command does not complete within ``timeout``
                seconds. The device state is set to ``ERROR`` in this case.
            Exception: Any exception raised inside ``coro_fn`` is re-raised here.
        """
        entry = self.devices.get(device_id)
        if entry is None:
            raise KeyError(f"Unknown device: {device_id}")

        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()
        await entry.queue.put((coro_fn, future))

        try:
            return await asyncio.wait_for(asyncio.shield(future), timeout=timeout)
        except asyncio.TimeoutError:
            entry.state = DeviceState.ERROR
            entry.last_error = "Command timed out"
            raise

    def get_device_list(self) -> list[DeviceStatus]:
        """Return a status summary for every registered device.

        Returns:
            A list of :class:`DeviceStatus` instances, one per device, in
            insertion order.
        """
        now = datetime.now(timezone.utc)
        statuses = []
        for e in self.devices.values():
            uptime = (
                (now - e.online_since).total_seconds() / 60 if e.online_since else None
            )
            statuses.append(
                DeviceStatus(
                    id=e.config.id,
                    label=e.config.label,
                    ip=e.config.ip,
                    port=e.config.port,
                    state=e.state,
                    last_error=e.last_error,
                    online_since_utc=(
                        e.online_since.isoformat() if e.online_since else None
                    ),
                    uptime_minutes=uptime,
                )
            )
        return statuses

    def get_device(self, device_id: str) -> DeviceEntry:
        """Return the :class:`DeviceEntry` for a registered device.

        Args:
            device_id: Identifier of the device to retrieve.

        Returns:
            The :class:`DeviceEntry` for the requested device.

        Raises:
            KeyError: If ``device_id`` is not registered.
        """
        entry = self.devices.get(device_id)
        if entry is None:
            raise KeyError(f"Unknown device: {device_id}")
        return entry

    def update_state(self, device_id: str, state: DeviceState) -> None:
        """Update the state of a registered device.

        Silently does nothing if ``device_id`` is not registered.

        Args:
            device_id: Identifier of the device to update.
            state: The new :class:`DeviceState` to assign.
        """
        if device_id in self.devices:
            entry = self.devices[device_id]
            entry.state = state
            if state == DeviceState.ONLINE and entry.online_since is None:
                entry.online_since = datetime.now(timezone.utc)
            elif state in (DeviceState.OFFLINE, DeviceState.ERROR):
                entry.online_since = None

    def instantiate_driver(self, device_id: str) -> BaseOscilloscopeDriver:
        """Create a new driver instance for a device and attach it to the entry.

        Dynamically imports the driver class using the path stored in the
        device's :class:`DeviceConfig`, constructs an instance with the device's
        IP and port, and stores it as ``entry.driver``.

        Args:
            device_id: Identifier of the device for which to create a driver.

        Returns:
            The newly created :class:`~app.instruments.base_driver.BaseOscilloscopeDriver`
            instance (also stored in ``entry.driver``).
        """
        entry = self.devices[device_id]
        driver_class = _load_driver_class(entry.config.driver_class_path)
        driver = driver_class(ip=entry.config.ip, port=entry.config.port)
        entry.driver = driver
        return driver


instrument_manager = InstrumentManager()
