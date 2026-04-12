"""Openbis-compatible driver for Rigol DS1000 series oscilloscopes."""

import numpy as np

from app.instruments.base_driver import (
    BaseOscilloscopeDriver,
    ChannelConfig,
    InstrumentInfo,
    TimebaseConfig,
    TriggerConfig,
    WaveformData,
)

from .pymeasure_rigol_ds1000 import RigolDS1000ZSeries as _RigolDS1000Z

_SLOPE_MAP = {"POS": "RISE", "NEG": "FALL", "RFAL": "EITHER"}
_SWEEP_MAP = {"AUTO": "AUTO", "NORM": "NORMAL", "SING": "SINGLE"}


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
            adapter.open()

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
        """
        self.instrument.waveform_source = f"CHAN{channel}"
        self.instrument.waveform_mode = "RAW"
        self.instrument.waveform_format = "BYTE"

        preamble = self.instrument.get_waveform_preamble()
        voltages = self.instrument.get_waveform_data(raw=False)

        n_points = len(voltages)
        x_inc = preamble["xincrement"]
        x_origin = preamble["xorigin"]
        x_ref = preamble["xreference"]
        time_array = x_origin + x_ref + np.arange(n_points) * x_inc

        sample_rate = 1.0 / x_inc if x_inc > 0 else 0.0

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
