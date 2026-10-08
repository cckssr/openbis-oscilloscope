"""Abstract base class, data classes and optional-capability hooks for oscilloscope drivers.

The built-in :class:`MockOscilloscopeDriver` lives in
:mod:`app.instruments.mock_driver`; it is still importable from this module for
backwards compatibility (lazy re-export, see :func:`__getattr__`).
"""

import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Callable

import numpy as np

from app.core.exceptions import AcquisitionCancelledError

# Signature of the progress hook: ``(points_done, points_total)`` of one read.
ProgressCallback = Callable[[int, int], None]


@dataclass
class WaveformData:
    """A single acquired waveform from one oscilloscope channel.

    Attributes:
        channel: Channel number (1-based) that was acquired.
        time_array: Numpy array of time values in ``unit_x`` units.
        voltage_array: Numpy array of voltage values in ``unit_y`` units.
            Must have the same length as ``time_array``.
        sample_rate: Effective sample rate in samples per second.
        record_length: Number of samples in the acquisition.
        unit_x: Physical unit of the time axis. Defaults to ``"s"`` (seconds).
        unit_y: Physical unit of the voltage axis. Defaults to ``"V"`` (volts).
    """

    channel: int
    time_array: np.ndarray
    voltage_array: np.ndarray
    sample_rate: float
    record_length: int
    unit_x: str = "s"
    unit_y: str = "V"


@dataclass
class ChannelConfig:
    """Configuration snapshot for a single oscilloscope input channel.

    Attributes:
        channel: Channel number (1-based).
        enabled: Whether the channel is active and visible on the display.
        scale_v_div: Vertical scale in volts per division.
        offset_v: Vertical offset in volts.
        coupling: Input coupling mode. One of ``"DC"``, ``"AC"``, or ``"GND"``.
        probe_attenuation: Probe attenuation factor (e.g. ``10.0`` for a 10× probe).
    """

    channel: int
    enabled: bool
    scale_v_div: float
    offset_v: float
    coupling: str  # "DC", "AC", "GND"
    probe_attenuation: float = 1.0


@dataclass
class TimebaseConfig:
    """Timebase (horizontal) configuration of the oscilloscope.

    Attributes:
        scale_s_div: Horizontal scale in seconds per division.
        offset_s: Horizontal offset (trigger position) in seconds.
        sample_rate: Current sample rate in samples per second.
    """

    scale_s_div: float
    offset_s: float
    sample_rate: float


@dataclass
class TriggerConfig:
    """Trigger configuration of the oscilloscope.

    Attributes:
        source: Trigger source identifier (e.g. ``"CH1"``).
        level_v: Trigger level in volts.
        slope: Edge direction. One of ``"RISE"``, ``"FALL"``, or ``"EITHER"``.
        mode: Trigger mode. One of ``"AUTO"``, ``"NORMAL"``, or ``"SINGLE"``.
    """

    source: str
    level_v: float
    slope: str  # "RISE", "FALL", "EITHER"
    mode: str  # "AUTO", "NORMAL", "SINGLE"


@dataclass
class InstrumentInfo:
    """Identity information returned by the instrument.

    Attributes:
        idn: Raw identification string (e.g. the response to ``*IDN?``).
        ip: IP address of the instrument.
        firmware: Firmware version string. Empty string if not available.
    """

    idn: str
    ip: str
    firmware: str = ""


class BaseOscilloscopeDriver(ABC):
    """Abstract base class defining the interface every oscilloscope driver must implement.

    Concrete drivers subclass this and implement all abstract methods using the
    instrument's communication protocol (SCPI over TCP, vendor SDK, etc.).
    The :class:`~app.instruments.manager.InstrumentManager` instantiates drivers
    dynamically based on the ``driver`` field in ``oscilloscopes.yaml``.

    Beyond the abstract interface a driver may opt in to *optional
    capabilities* by overriding :meth:`single`, :meth:`force_trigger` and/or
    :meth:`autoscale`, and by calling :meth:`report_progress` /
    :meth:`raise_if_cancelled` inside long reads (and then setting
    ``supports_cancel_acquire = True``). :attr:`capabilities` derives the list
    reported by ``GET /devices/{id}`` from exactly that, so no router code has
    to know which driver supports what.

    Attributes:
        ip: IP address of the instrument.
        port: TCP port number (default ``5025`` for LXI/SCPI instruments).
        channel_count: Number of analog input channels (default ``4``).
        supports_cancel_acquire: Set to ``True`` by drivers that call
            :meth:`raise_if_cancelled` between the blocks of a long read.
    """

    channel_count: int = 4
    supports_cancel_acquire: bool = False

    # Per-job hooks, wired by the acquire endpoint just before a read.
    _progress_cb: ProgressCallback | None = None
    _cancel_event: threading.Event | None = None

    def __init__(self, ip: str, port: int = 5025) -> None:
        """Initialize the driver with the instrument's network address.

        Args:
            ip: IP address of the oscilloscope.
            port: TCP port number. Defaults to ``5025`` (standard LXI/SCPI port).
        """
        self.ip = ip
        self.port = port

    # ------------------------------------------------------------------
    # Optional capabilities
    # ------------------------------------------------------------------

    @property
    def capabilities(self) -> list[str]:
        """Return the capability names this driver supports.

        ``run``, ``stop``, ``acquire``, ``preview`` and ``screenshot`` are
        always present (they are abstract or built on abstract methods). The
        optional ones are added when the subclass overrides the matching
        method (``single``, ``force_trigger``, ``autoscale``) or sets
        ``supports_cancel_acquire`` (``cancel_acquire``).

        Returns:
            Capability names in a stable order.
        """
        caps = ["run", "stop", "acquire", "preview", "screenshot"]
        for name in ("single", "force_trigger", "autoscale"):
            if getattr(type(self), name) is not getattr(BaseOscilloscopeDriver, name):
                caps.append(name)
        if self.supports_cancel_acquire:
            caps.append("cancel_acquire")
        return caps

    def single(self) -> None:
        """Arm a single acquisition (optional capability ``"single"``).

        Override in drivers whose instrument has a single-shot mode.

        Raises:
            NotImplementedError: Always, unless overridden.
        """
        raise NotImplementedError("single() is not supported by this driver")

    def force_trigger(self) -> None:
        """Force a trigger event now (optional capability ``"force_trigger"``).

        Raises:
            NotImplementedError: Always, unless overridden.
        """
        raise NotImplementedError("force_trigger() is not supported by this driver")

    def autoscale(self) -> None:
        """Run the instrument's Auto-Setup (optional capability ``"autoscale"``).

        Implementations should block until the instrument has settled so the
        next read sees the new scales.

        Raises:
            NotImplementedError: Always, unless overridden.
        """
        raise NotImplementedError("autoscale() is not supported by this driver")

    # ------------------------------------------------------------------
    # Progress / cancel hooks for long reads
    # ------------------------------------------------------------------

    def bind_job_hooks(
        self,
        on_progress: ProgressCallback | None = None,
        cancel_event: threading.Event | None = None,
    ) -> None:
        """Attach progress and cancel hooks for the read that is about to start.

        Called by the acquire endpoint (from the worker thread) before reading
        a channel. Drivers never call this themselves.

        Args:
            on_progress: Called as ``on_progress(points_done, points_total)``
                by :meth:`report_progress`.
            cancel_event: When set, :meth:`raise_if_cancelled` raises.
        """
        self._progress_cb = on_progress
        self._cancel_event = cancel_event

    def unbind_job_hooks(self) -> None:
        """Detach the hooks attached by :meth:`bind_job_hooks`."""
        self._progress_cb = None
        self._cancel_event = None

    def report_progress(self, done: int, total: int) -> None:
        """Report read progress; no-op when no hook is attached.

        Call after every block of a long read (e.g. each 250 k-point SCPI
        transfer). Safe to call from the worker thread.

        Args:
            done: Points transferred so far for the current channel.
            total: Points the current channel read will transfer in total.
        """
        if self._progress_cb is not None:
            self._progress_cb(done, total)

    def raise_if_cancelled(self) -> None:
        """Abort the current read if the user cancelled the acquisition.

        Call between blocks of a long read. The caller is responsible for
        restoring the instrument state (e.g. ``RUN``) in a ``finally`` block.

        Raises:
            AcquisitionCancelledError: If the bound cancel event is set.
        """
        if self._cancel_event is not None and self._cancel_event.is_set():
            raise AcquisitionCancelledError()

    @abstractmethod
    def connect(self) -> None:
        """Open a connection to the instrument.

        Raises:
            Exception: Any connection-level error (e.g. socket timeout, VISA error).
        """

    @abstractmethod
    def disconnect(self) -> None:
        """Close the connection to the instrument.

        Should be safe to call even if not connected.
        """

    @abstractmethod
    def identify(self) -> InstrumentInfo:
        """Query the instrument identity (``*IDN?`` or equivalent).

        Returns:
            An :class:`InstrumentInfo` with the raw IDN string, IP address,
            and firmware version.
        """

    @abstractmethod
    def run(self) -> None:
        """Start continuous acquisition (RUN mode)."""

    @abstractmethod
    def stop(self) -> None:
        """Stop acquisition (STOP/SINGLE mode)."""

    @abstractmethod
    def acquire_waveform(self, channel: int, max_samples: bool) -> WaveformData:
        """Acquire and return waveform data from the specified channel.

        Args:
            channel: 1-based channel number to read from.
            max_samples: If ``True``, acquire the maximum number of samples available on the device. If false, the driver may apply a default decimation to fit the waveform into memory.

        Returns:
            A :class:`WaveformData` instance containing time and voltage arrays
            along with sampling metadata.
        """

    def acquire_waveform_max(self, channel: int) -> WaveformData:
        """Acquire maximum-depth waveform data from the specified channel.

        Default implementation calls :meth:`acquire_waveform` with
        ``max_samples=False`` as a fallback for drivers that do not support a
        dedicated high-depth mode.  Override in hardware drivers that do (e.g.
        ``RigolDS1000Driver`` delegates to ``acquire_waveform(max_samples=True)``).

        Args:
            channel: 1-based channel number to read from.

        Returns:
            A :class:`WaveformData` instance.
        """
        return self.acquire_waveform(channel, max_samples=False)

    @abstractmethod
    def get_screenshot(self) -> bytes:
        """Capture the current oscilloscope display and return it as PNG bytes.

        Returns:
            Raw PNG image data as a :class:`bytes` object.
        """

    def get_available_channels(self) -> list[int]:
        """Return channel numbers that are currently enabled on the instrument.

        Default implementation calls :meth:`get_channel_enabled` for channels
        1–:attr:`channel_count` and returns those that are active.  Override in hardware drivers
        if the instrument provides a faster batch query for all channel states.

        Returns:
            Sorted list of 1-based channel numbers that are currently enabled.
        """
        return sorted(
            ch
            for ch in range(1, self.channel_count + 1)
            if self.get_channel_enabled(ch)
        )

    def get_channel_enabled(self, channel: int) -> bool:
        """Return whether the specified channel is currently active/visible.

        Default implementation calls :meth:`get_channel_config` and reads the
        ``enabled`` field.  Override in hardware drivers to issue a single
        lightweight query (e.g. ``:CHANnelN:DISPlay?``) instead of reading the
        full channel configuration.

        Args:
            channel: 1-based channel number to query.

        Returns:
            ``True`` if the channel is enabled, ``False`` otherwise.
        """
        return self.get_channel_config(channel).enabled

    @abstractmethod
    def get_channel_config(self, channel: int) -> ChannelConfig:
        """Return the current configuration for the specified input channel.

        Args:
            channel: 1-based channel number to query.

        Returns:
            A :class:`ChannelConfig` snapshot of the channel's current settings.
        """

    @abstractmethod
    def get_timebase(self) -> TimebaseConfig:
        """Return the current horizontal timebase configuration.

        Returns:
            A :class:`TimebaseConfig` snapshot of scale, offset, and sample rate.
        """

    @abstractmethod
    def get_trigger(self) -> TriggerConfig:
        """Return the current trigger configuration.

        Returns:
            A :class:`TriggerConfig` snapshot of source, level, slope, and mode.
        """

    @abstractmethod
    def set_channel_config(self, channel: int, config: ChannelConfig) -> None:
        """Apply the given channel configuration to the instrument.

        Args:
            channel: 1-based channel number to configure.
            config: The :class:`ChannelConfig` values to apply.
        """

    @abstractmethod
    def set_timebase(self, config: TimebaseConfig) -> None:
        """Apply the given timebase configuration to the instrument.

        The ``sample_rate`` field of *config* is read-only on most hardware and
        is ignored by implementations that cannot set it directly.

        Args:
            config: The :class:`TimebaseConfig` values to apply.
        """

    @abstractmethod
    def set_trigger(self, config: TriggerConfig) -> None:
        """Apply the given trigger configuration to the instrument.

        Args:
            config: The :class:`TriggerConfig` values to apply.
        """

    def set_keyboard_lock(self, locked: bool) -> None:
        """Lock or unlock the physical front-panel keys on the instrument.

        Default implementation is a no-op. Override in hardware drivers that
        expose a key-lock command (e.g. Rigol DS1000 series via
        ``system_locked``).

        Locking prevents users from accidentally changing settings during
        automated acquisitions. Always call with ``locked=False`` when the
        acquisition is complete to restore normal operation.

        Args:
            locked: ``True`` to lock the front-panel keys; ``False`` to unlock.
        """

    @abstractmethod
    def get_memory_depth(self) -> int:
        """Return the current acquisition memory depth in samples.

        Returns:
            Number of samples currently configured in the acquisition memory.
        """

    def get_all_settings(self) -> dict:
        """Collect a complete snapshot of all instrument settings for metadata storage.

        Calls :meth:`identify`, :meth:`get_timebase`, :meth:`get_trigger`, and
        :meth:`get_channel_config` for every channel, assembling the results into
        a nested dictionary. Channels that raise an exception (e.g. not present on
        the instrument) are silently skipped. Only enabled channels are included.

        Returns:
            A dict with keys ``"instrument"``, ``"timebase"``, ``"trigger"``,
            and ``"channels"`` (a sub-dict keyed by channel number string).
        """
        info = self.identify()
        tb = self.get_timebase()
        trig = self.get_trigger()

        settings_dict: dict = {
            "instrument": {
                "idn": info.idn,
                "ip": info.ip,
                "firmware": info.firmware,
            },
            "timebase": {
                "scale_s_div": tb.scale_s_div,
                "offset_s": tb.offset_s,
                "sample_rate": tb.sample_rate,
            },
            "trigger": {
                "source": trig.source,
                "level_v": trig.level_v,
                "slope": trig.slope,
                "mode": trig.mode,
            },
            "channels": {},
        }

        for ch in range(1, self.channel_count + 1):
            try:
                cfg = self.get_channel_config(ch)
                if cfg.enabled:
                    settings_dict["channels"][str(ch)] = {
                        "enabled": cfg.enabled,
                        "scale_v_div": cfg.scale_v_div,
                        "offset_v": cfg.offset_v,
                        "coupling": cfg.coupling,
                        "probe_attenuation": cfg.probe_attenuation,
                    }
            except Exception:
                pass

        return settings_dict


def __getattr__(name: str):
    """Lazily re-export :class:`MockOscilloscopeDriver` (avoids a circular import).

    ``MockOscilloscopeDriver`` used to live in this module. It now lives in
    :mod:`app.instruments.mock_driver`, which itself imports this module, so the
    old import path ``from app.instruments.base_driver import
    MockOscilloscopeDriver`` is served lazily.

    Args:
        name: Attribute name requested from this module.

    Returns:
        The mock driver class for ``"MockOscilloscopeDriver"``.

    Raises:
        AttributeError: For any other unknown attribute.
    """
    if name == "MockOscilloscopeDriver":
        from app.instruments.mock_driver import MockOscilloscopeDriver

        return MockOscilloscopeDriver
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
