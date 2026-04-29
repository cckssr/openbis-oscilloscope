"""Abstract base driver class and built-in mock implementation for oscilloscope drivers."""

import math
import struct
import time
import zlib
from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np


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

    Attributes:
        ip: IP address of the instrument.
        port: TCP port number (default ``5025`` for LXI/SCPI instruments).
    """

    def __init__(self, ip: str, port: int = 5025) -> None:
        """Initialize the driver with the instrument's network address.

        Args:
            ip: IP address of the oscilloscope.
            port: TCP port number. Defaults to ``5025`` (standard LXI/SCPI port).
        """
        self.ip = ip
        self.port = port

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
        1–4 and returns those that are active.  Override in hardware drivers
        if the instrument provides a faster batch query for all channel states.

        Returns:
            Sorted list of 1-based channel numbers that are currently enabled.
        """
        return sorted(ch for ch in range(1, 5) if self.get_channel_enabled(ch))

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

    def get_all_settings(self) -> dict:
        """Collect a complete snapshot of all instrument settings for metadata storage.

        Calls :meth:`identify`, :meth:`get_timebase`, :meth:`get_trigger`, and
        :meth:`get_channel_config` for channels 1–4, assembling the results into
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

        for ch in range(1, 5):
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


# ---------------------------------------------------------------------------
# Built-in mock driver (used in DEBUG mode and automated tests)
# ---------------------------------------------------------------------------

_BLANK_PNG: bytes | None = None


def _make_blank_png() -> bytes:
    """Build a minimal valid 640×480 white PNG image using only stdlib."""

    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        chunk_len = len(data)
        chunk_data = chunk_type + data
        crc = zlib.crc32(chunk_data) & 0xFFFFFFFF
        return struct.pack(">I", chunk_len) + chunk_data + struct.pack(">I", crc)

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", 640, 480, 8, 2, 0, 0, 0)
    ihdr = png_chunk(b"IHDR", ihdr_data)
    raw_row = b"\x00" + b"\xff\xff\xff" * 640
    compressed = zlib.compress(raw_row * 480)
    idat = png_chunk(b"IDAT", compressed)
    iend = png_chunk(b"IEND", b"")
    return signature + ihdr + idat + iend


def _get_blank_png() -> bytes:
    """Return a cached blank PNG, building it once on first call."""
    global _BLANK_PNG
    if _BLANK_PNG is None:
        _BLANK_PNG = _make_blank_png()
    return _BLANK_PNG


class MockOscilloscopeDriver(BaseOscilloscopeDriver):
    """Synthetic oscilloscope driver that generates sine-wave data in memory.

    Intended for local development (``DEBUG=True``) and automated tests.
    No real network connection is made; all responses are computed immediately.

    Each channel produces a sine wave at a distinct frequency:

    - Channel 1: 1 kHz
    - Channel 2: 1.5 kHz
    - Channel 3: 2 kHz
    - Channel 4: 2.5 kHz

    Small Gaussian noise (σ = 0.01 V) is added to each waveform. All four
    channels are enabled by default.

    Use ``driver: "mock"`` in ``oscilloscopes.yaml`` to activate this driver
    for a specific device, or set ``DEBUG=True`` to force it for all devices.
    """

    def __init__(self, ip: str = "127.0.0.1", port: int = 5025) -> None:
        super().__init__(ip, port)
        self._connected = False
        self._running = False
        self._stop_time: float = 0.0
        self._rng = np.random.default_rng(seed=42)
        self._channels: dict[int, ChannelConfig] = {
            ch: ChannelConfig(
                channel=ch,
                enabled=True,
                scale_v_div=1.0,
                offset_v=0.0,
                coupling="DC",
                probe_attenuation=1.0,
            )
            for ch in range(1, 5)
        }
        self._timebase = TimebaseConfig(scale_s_div=1e-6, offset_s=0.0, sample_rate=1e9)
        self._trigger = TriggerConfig(
            source="CH1", level_v=0.0, slope="RISE", mode="AUTO"
        )
        self._keyboard_locked = False

    def connect(self) -> None:
        self._connected = True

    def disconnect(self) -> None:
        self._connected = False

    def identify(self) -> InstrumentInfo:
        return InstrumentInfo(
            idn="MOCK,MockScope,SN000001,FW1.0", ip=self.ip, firmware="FW1.0"
        )

    def run(self) -> None:
        self._running = True

    def stop(self) -> None:
        self._running = False
        self._stop_time = time.time()

    def acquire_waveform(self, channel: int, max_samples: bool = False) -> WaveformData:
        """Generate a synthetic sine-wave waveform for the requested channel.

        When the scope is running the phase advances with wall-clock time so
        successive calls show different snapshots; when stopped the waveform is
        frozen at the instant :meth:`stop` was called.

        Args:
            channel: 1-based channel number (1–4).
            max_samples: If ``True``, returns a 10× wider window (MAX-mode simulation).
        """
        num_divs = 10
        multiplier = 10 if max_samples else 1
        window_s = self._timebase.scale_s_div * num_divs * multiplier
        sample_rate = 1e6
        min_samples = 10_000 if max_samples else 1_000
        max_cap = 1_500_000 if max_samples else 100_000
        record_length = min(max(min_samples, int(sample_rate * window_s)), max_cap)

        freq_hz = 1e3 + (channel - 1) * 500
        amplitude = self._channels[channel].scale_v_div * 3.0
        phase_time = time.time() if self._running else self._stop_time

        t = np.linspace(0, window_s, record_length, endpoint=False)
        v = amplitude * np.sin(2 * math.pi * freq_hz * (t + phase_time))
        v = v + self._rng.normal(0, 0.01 * amplitude, size=record_length)

        return WaveformData(
            channel=channel,
            time_array=t,
            voltage_array=v,
            sample_rate=sample_rate,
            record_length=record_length,
        )

    def acquire_waveform_max(self, channel: int) -> WaveformData:
        """Delegate to :meth:`acquire_waveform` with ``max_samples=True``."""
        return self.acquire_waveform(channel, max_samples=True)

    def get_screenshot(self) -> bytes:
        return _get_blank_png()

    def get_channel_config(self, channel: int) -> ChannelConfig:
        return self._channels[channel]

    def get_timebase(self) -> TimebaseConfig:
        return self._timebase

    def get_trigger(self) -> TriggerConfig:
        return self._trigger

    def set_channel_config(self, channel: int, config: ChannelConfig) -> None:
        self._channels[channel] = config

    def set_timebase(self, config: TimebaseConfig) -> None:
        self._timebase = config

    def set_trigger(self, config: TriggerConfig) -> None:
        self._trigger = config

    def set_keyboard_lock(self, locked: bool) -> None:
        self._keyboard_locked = locked
