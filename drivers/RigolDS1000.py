"""
Driver for Rigol DS1000Z series oscilloscopes.

Uses LAN/TCP SCPI communication via PyMeasure's RigolDS1000ZSeries class.

Register in config/oscilloscopes.yaml:
    driver: "drivers.RigolDS1000.RigolDS1000"
"""

import numpy as np

from app.instruments.base_driver import (
    BaseOscilloscopeDriver,
    ChannelConfig,
    InstrumentInfo,
    TimebaseConfig,
    TriggerConfig,
    WaveformData,
)
from app.instruments.pymeasure_rigol_ds1000 import RigolDS1000ZSeries

_SLOPE_MAP = {"POS": "RISE", "NEG": "FALL", "RFAL": "EITHER"}
_SWEEP_MAP = {"AUTO": "AUTO", "NORM": "NORMAL", "SING": "SINGLE"}


class RigolDS1000(BaseOscilloscopeDriver):
    """Driver for Rigol DS1000Z series oscilloscopes over LAN/TCP."""

    def __init__(self, ip: str, port: int = 5025) -> None:
        super().__init__(ip, port)
        self._resource: RigolDS1000ZSeries | None = None

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    def connect(self) -> None:
        """Open a TCP socket VISA connection to the oscilloscope."""
        self._resource = RigolDS1000ZSeries(f"TCPIP::{self.ip}::{self.port}::SOCKET")

    def disconnect(self) -> None:
        """Close the instrument connection."""
        if self._resource is not None:
            self._resource.shutdown()
            self._resource = None

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    def identify(self) -> InstrumentInfo:
        """Query ``*IDN?`` and return instrument identity information.

        Parses the comma-separated IDN string to extract the firmware version
        from the fourth field (e.g. ``RIGOL,DS1054Z,DS1ZA...,00.04.04``).
        """
        idn = self._resource.id.strip()
        parts = idn.split(",")
        firmware = parts[3].strip() if len(parts) >= 4 else ""
        return InstrumentInfo(idn=idn, ip=self.ip, firmware=firmware)

    # ------------------------------------------------------------------
    # Acquisition control
    # ------------------------------------------------------------------

    def run(self) -> None:
        """Start continuous acquisition (RUN mode)."""
        self._resource.run()

    def stop(self) -> None:
        """Stop acquisition (STOP mode)."""
        self._resource.stop()

    # ------------------------------------------------------------------
    # Waveform
    # ------------------------------------------------------------------

    def acquire_waveform(self, channel: int) -> WaveformData:
        """Transfer waveform data from the given channel.

        Configures the waveform subsystem for NORM/BYTE mode, reads the preamble
        to obtain scale factors, then converts raw byte values to a voltage array
        and builds the corresponding time axis from ``xincrement`` and ``xorigin``.

        Args:
            channel: 1-based channel number (1–4).
        """
        self._resource.waveform_source = f"CHAN{channel}"
        self._resource.waveform_mode = "NORM"
        self._resource.waveform_format = "BYTE"

        preamble = self._resource.get_waveform_preamble()
        voltages = self._resource.get_waveform_data()

        n = len(voltages)
        xinc = preamble["xincrement"]
        time_array = np.arange(n) * xinc + preamble["xorigin"]
        sample_rate = 1.0 / xinc if xinc != 0.0 else 0.0

        return WaveformData(
            channel=channel,
            time_array=time_array,
            voltage_array=voltages,
            sample_rate=sample_rate,
            record_length=n,
        )

    # ------------------------------------------------------------------
    # Screenshot
    # ------------------------------------------------------------------

    def get_screenshot(self) -> bytes:
        """Capture the oscilloscope display and return PNG image bytes.

        Sets the storage image type to PNG before issuing ``:DISPlay:DATA?``
        so the returned bytes are always valid PNG data.
        """
        self._resource.storage_image_type = "PNG"
        return self._resource.get_display_data()

    # ------------------------------------------------------------------
    # Settings queries
    # ------------------------------------------------------------------

    def get_channel_config(self, channel: int) -> ChannelConfig:
        """Return the current configuration for the specified channel.

        Args:
            channel: 1-based channel number (1–4).
        """
        ch = getattr(self._resource, f"ch{channel}")
        return ChannelConfig(
            channel=channel,
            enabled=ch.is_enabled,
            scale_v_div=ch.scale,
            offset_v=ch.offset,
            coupling=ch.coupling,
            probe_attenuation=ch.probe_ratio,
        )

    def get_timebase(self) -> TimebaseConfig:
        """Return the current horizontal timebase configuration."""
        return TimebaseConfig(
            scale_s_div=self._resource.timebase_scale,
            offset_s=self._resource.timebase_offset,
            sample_rate=float(self._resource.acq_sample_rate),
        )

    def get_trigger(self) -> TriggerConfig:
        """Return the current edge trigger configuration.

        Reads source, level, slope, and sweep mode from the edge trigger subsystem.
        PyMeasure slope values (``POS``/``NEG``/``RFAL``) are mapped to the
        ``TriggerConfig`` convention (``RISE``/``FALL``/``EITHER``), and sweep
        values (``NORM``/``SING``) to ``NORMAL``/``SINGLE``.
        """
        source = self._resource.trigger_edge_source
        level = float(self._resource.trigger_edge_level)
        slope = _SLOPE_MAP.get(
            self._resource.trigger_edge_slope, self._resource.trigger_edge_slope
        )
        mode = _SWEEP_MAP.get(
            self._resource.trigger_sweep, self._resource.trigger_sweep
        )
        return TriggerConfig(source=source, level_v=level, slope=slope, mode=mode)
