"""Openbis-compatible driver for Rigol DS1000 series oscilloscopes."""

import numpy as np
import logging

from app.instruments.base_driver import (
    BaseOscilloscopeDriver,
    ChannelConfig,
    InstrumentInfo,
    TimebaseConfig,
    TriggerConfig,
    WaveformData,
)

from app.instruments.pymeasure_rigol_ds1000 import RigolDS1000ZSeries as _RigolDS1000Z

_SLOPE_MAP = {"POS": "RISE", "NEG": "FALL", "RFAL": "EITHER"}
_SWEEP_MAP = {"AUTO": "AUTO", "NORM": "NORMAL", "SING": "SINGLE"}

logger = logging.getLogger(__name__)


class RigolDS1000Driver(BaseOscilloscopeDriver):
    """Driver for Rigol DS1000 series oscilloscopes.

    This driver uses the pymeasure library's RigolDS1000ZSeries class to
    communicate with the instrument over SCPI via TCP/IP. It implements all
    required methods to retrieve waveform data and configuration.

    Note: This driver assumes the oscilloscope is configured to return data in
    a compatible format (e.g. vertical scale in volts/div, horizontal scale in
    seconds/div, etc.). Some manual setup may be required on the instrument.
    """

    def __init__(self, ip: str, port: int = 5025) -> None:
        super().__init__(ip, port)
        self.instrument = _RigolDS1000Z(f"TCPIP::{ip}::INSTR")

    def connect(self) -> None:
        """Open the VISA connection to the instrument.

        pymeasure opens the adapter on construction, so this is a no-op unless
        the adapter was previously closed.
        """
        # pymeasure opens the connection when the instrument is instantiated.
        # Re-open only if the adapter exposes an explicit open() method.
        adapter = self.instrument.adapter
        if hasattr(adapter, "open"):
            try:
                adapter.open()
                logger.info("Connected to Rigol DS1000 at %s:%d", self.ip, self.port)
            except Exception as exc:
                raise ConnectionError(
                    f"Failed to open VISA adapter for {self.ip}:{self.port}: {exc}"
                ) from exc

    def disconnect(self) -> None:
        """Close the VISA connection to the instrument."""
        self.instrument.adapter.close()

    def identify(self) -> InstrumentInfo:
        """Query the instrument identity via *IDN?.

        Returns:
            InstrumentInfo with raw IDN string, IP address, and firmware version.
            The firmware is the fourth comma-separated field of the IDN string
            (e.g. ``"00.04.04.SP4"``).
        """
        idn = self.instrument.id.strip()
        parts = idn.split(",")
        firmware = parts[3].strip() if len(parts) >= 4 else ""
        return InstrumentInfo(idn=idn, ip=self.ip, firmware=firmware)

    def run(self) -> None:
        """Start continuous acquisition (RUN mode)."""
        self.instrument.run()

    def stop(self) -> None:
        """Stop acquisition (STOP mode)."""
        self.instrument.stop()

    def acquire_waveform(self, channel: int) -> WaveformData:
        """Acquire and return waveform data from the specified channel.

        Stops the oscilloscope, reads waveform data in BYTE format from internal
        memory (RAW mode), converts raw ADC values to voltages using the preamble
        parameters, then restarts acquisition.

        Args:
            channel: 1-based channel number (1–4).

        Returns:
            WaveformData with time/voltage arrays and sampling metadata.

        Raises:
            ValueError: If channel is not in 1–4 or the preamble xincrement is zero.
        """
        if not 1 <= channel <= 4:
            raise ValueError(f"Channel must be 1–4, got {channel}")

        self.instrument.waveform_source = f"CHAN{channel}"
        self.instrument.waveform_mode = "RAW"
        self.instrument.waveform_format = "BYTE"

        voltages, preamble = self.instrument.get_waveform_data(
            raw=False, return_preamble=True
        )

        n_points = len(voltages)
        x_inc = preamble["xincrement"]
        x_origin = preamble["xorigin"]
        x_ref = preamble["xreference"]  # sample-index of the reference point (integer)

        if x_inc <= 0:
            raise ValueError(f"Invalid xincrement from preamble: {x_inc}")

        # Correct formula: x_ref is a sample index, not a time value.
        time_array = x_origin + (np.arange(n_points) - x_ref) * x_inc
        sample_rate = 1.0 / x_inc

        # RAW mode stops the scope; restart so continuous acquisition resumes.
        try:
            self.instrument.run()
        except Exception:
            pass  # Non-fatal — the next explicit run() call will recover

        return WaveformData(
            channel=channel,
            time_array=time_array,
            voltage_array=voltages,
            sample_rate=sample_rate,
            record_length=n_points,
        )

    def get_screenshot(self) -> bytes:
        """Capture the current oscilloscope display and return it as PNG bytes.

        Returns:
            Raw image bytes (format is determined by the instrument's storage
            image type setting — typically BMP or PNG).
        """
        return self.instrument.get_display_data()

    def get_available_channels(self):
        """Return a list of available channels on the instrument.

        This implementation assumes all four channels are always present. If
        the instrument model supports fewer channels, this method should be
        overridden to query the actual number of channels.

        Returns:
            List of 1-based channel numbers (e.g. [1, 2, 3, 4]).
        """
        enabled = []
        for ch in range(1, 5):
            try:
                if self.get_channel_enabled(ch):
                    enabled.append(ch)
            except Exception as exc:
                logger.error("Error occurred while checking channel %d: %s", ch, exc)
        return enabled

    def get_channel_enabled(self, channel: int) -> bool:
        """Return whether a channel is enabled using a single SCPI query.

        Overrides the base-class default to avoid reading scale, offset,
        coupling, and probe — saving four round-trips per disabled channel
        during acquire pre-screening.

        Args:
            channel: 1-based channel number (1–4).

        Returns:
            ``True`` if the channel display is on, ``False`` otherwise.
        """
        ch = getattr(self.instrument, f"ch{channel}")
        return bool(ch.is_enabled)

    def get_channel_config(self, channel: int) -> ChannelConfig:
        """Return the current configuration for the specified input channel.

        Args:
            channel: 1-based channel number (1–4).

        Returns:
            ChannelConfig snapshot of the channel's current settings.
        """
        ch = getattr(self.instrument, f"ch{channel}")
        return ChannelConfig(
            channel=channel,
            enabled=ch.is_enabled,
            scale_v_div=ch.scale,
            offset_v=ch.offset,
            coupling=ch.coupling,
            probe_attenuation=ch.probe_ratio,
        )

    def get_timebase(self) -> TimebaseConfig:
        """Return the current horizontal timebase configuration.

        Returns:
            TimebaseConfig snapshot of scale, offset, and sample rate.
        """
        return TimebaseConfig(
            scale_s_div=self.instrument.timebase_scale,
            offset_s=self.instrument.timebase_offset,
            sample_rate=float(self.instrument.acq_sample_rate),
        )

    def get_trigger(self) -> TriggerConfig:
        """Return the current trigger configuration.

        Only edge trigger parameters are read. If the instrument is configured
        for a different trigger mode the source, level, and slope values reflect
        the edge trigger subsystem settings.

        Returns:
            TriggerConfig snapshot of source, level, slope, and mode.
        """
        raw_source = self.instrument.trigger_edge_source
        # Instrument returns "CHAN1" / "CHAN2" … → normalise to "CH1" / "CH2" …
        if raw_source.startswith("CHAN"):
            source = "CH" + raw_source[4:]
        else:
            source = raw_source

        raw_slope = self.instrument.trigger_edge_slope
        slope = _SLOPE_MAP.get(raw_slope, raw_slope)

        raw_sweep = self.instrument.trigger_sweep
        mode = _SWEEP_MAP.get(raw_sweep, raw_sweep)

        return TriggerConfig(
            source=source,
            level_v=self.instrument.trigger_edge_level,
            slope=slope,
            mode=mode,
        )

    def set_channel_config(self, channel: int, config: ChannelConfig) -> None:
        """Apply channel configuration to the instrument.

        Args:
            channel: 1-based channel number (1–4).
            config: The :class:`ChannelConfig` values to apply.
        """
        ch = getattr(self.instrument, f"ch{channel}")
        ch.is_enabled = config.enabled
        ch.scale = config.scale_v_div
        ch.offset = config.offset_v
        ch.coupling = config.coupling
        ch.probe_ratio = config.probe_attenuation

    def set_timebase(self, config: TimebaseConfig) -> None:
        """Apply timebase configuration to the instrument.

        ``sample_rate`` is derived from the hardware after setting scale/offset
        and cannot be written directly; that field is ignored here.

        Args:
            config: The :class:`TimebaseConfig` values to apply.
        """
        self.instrument.timebase_scale = config.scale_s_div
        self.instrument.timebase_offset = config.offset_s

    def set_trigger(self, config: TriggerConfig) -> None:
        """Apply trigger configuration to the instrument.

        Source is normalised from ``"CH1"`` → ``"CHAN1"`` before writing.
        Slope and mode are reverse-mapped from the project convention back to
        the instrument's SCPI values.

        Args:
            config: The :class:`TriggerConfig` values to apply.
        """
        # Reverse maps
        _slope_rev = {v: k for k, v in _SLOPE_MAP.items()}
        _sweep_rev = {v: k for k, v in _SWEEP_MAP.items()}

        # Normalise CH1 → CHAN1 for the instrument
        source = config.source
        if source.startswith("CH") and not source.startswith("CHAN"):
            source = "CHAN" + source[2:]

        self.instrument.trigger_edge_source = source
        self.instrument.trigger_edge_level = config.level_v
        self.instrument.trigger_edge_slope = _slope_rev.get(config.slope, config.slope)
        self.instrument.trigger_sweep = _sweep_rev.get(config.mode, config.mode)
