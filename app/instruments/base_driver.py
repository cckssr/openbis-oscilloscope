from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import numpy as np


@dataclass
class WaveformData:
    channel: int
    time_array: np.ndarray
    voltage_array: np.ndarray
    sample_rate: float
    record_length: int
    unit_x: str = "s"
    unit_y: str = "V"


@dataclass
class ChannelConfig:
    channel: int
    enabled: bool
    scale_v_div: float
    offset_v: float
    coupling: str  # "DC", "AC", "GND"
    probe_attenuation: float = 1.0


@dataclass
class TimebaseConfig:
    scale_s_div: float
    offset_s: float
    sample_rate: float


@dataclass
class TriggerConfig:
    source: str
    level_v: float
    slope: str  # "RISE", "FALL", "EITHER"
    mode: str  # "AUTO", "NORMAL", "SINGLE"


@dataclass
class InstrumentInfo:
    idn: str
    ip: str
    firmware: str = ""


class BaseOscilloscopeDriver(ABC):
    """Abstract base class for oscilloscope drivers."""

    def __init__(self, ip: str, port: int = 5025) -> None:
        self.ip = ip
        self.port = port

    @abstractmethod
    def connect(self) -> None:
        """Open connection to the instrument."""

    @abstractmethod
    def disconnect(self) -> None:
        """Close connection to the instrument."""

    @abstractmethod
    def identify(self) -> InstrumentInfo:
        """Query instrument identity (*IDN?)."""

    @abstractmethod
    def run(self) -> None:
        """Start continuous acquisition (RUN)."""

    @abstractmethod
    def stop(self) -> None:
        """Stop acquisition (STOP)."""

    @abstractmethod
    def acquire_waveform(self, channel: int) -> WaveformData:
        """Acquire and return waveform data from the given channel."""

    @abstractmethod
    def get_screenshot(self) -> bytes:
        """Capture and return screen image as PNG bytes."""

    @abstractmethod
    def get_channel_config(self, channel: int) -> ChannelConfig:
        """Return current channel configuration."""

    @abstractmethod
    def get_timebase(self) -> TimebaseConfig:
        """Return current timebase configuration."""

    @abstractmethod
    def get_trigger(self) -> TriggerConfig:
        """Return current trigger configuration."""

    def get_all_settings(self) -> dict:
        """Return a combined dict of all instrument settings for metadata."""
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
