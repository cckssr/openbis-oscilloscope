"""Abstract base driver class defining the interface for oscilloscope drivers."""

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
    def acquire_waveform(self, channel: int) -> WaveformData:
        """Acquire and return waveform data from the specified channel.

        Args:
            channel: 1-based channel number to read from.

        Returns:
            A :class:`WaveformData` instance containing time and voltage arrays
            along with sampling metadata.
        """

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
