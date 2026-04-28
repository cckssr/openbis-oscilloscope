"""Mock oscilloscope driver for development and testing."""

import math
import struct
import time
import zlib

import numpy as np

from app.instruments.base_driver import (
    BaseOscilloscopeDriver,
    ChannelConfig,
    InstrumentInfo,
    TimebaseConfig,
    TriggerConfig,
    WaveformData,
)


_BLANK_PNG: bytes | None = None  # cached after first call


def _make_blank_png() -> bytes:
    """Build a minimal valid 640×480 white PNG image in pure Python.

    Constructs the binary PNG from scratch using only the standard library
    (``struct`` and ``zlib``), so no Pillow or other imaging library is required.

    Returns:
        Raw PNG file bytes for a 640×480 24-bit white image.
    """

    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        """Encode a single PNG chunk with length, type, data, and CRC.

        Args:
            chunk_type: Four-byte PNG chunk type identifier (e.g. ``b"IHDR"``).
            data: Raw chunk payload bytes.

        Returns:
            The complete chunk bytes including length prefix and CRC suffix.
        """
        chunk_len = len(data)
        chunk_data = chunk_type + data
        crc = zlib.crc32(chunk_data) & 0xFFFFFFFF
        return struct.pack(">I", chunk_len) + chunk_data + struct.pack(">I", crc)

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", 640, 480, 8, 2, 0, 0, 0)
    ihdr = png_chunk(b"IHDR", ihdr_data)

    raw_row = b"\x00" + b"\xff\xff\xff" * 640
    raw_data = raw_row * 480
    compressed = zlib.compress(raw_data)
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

    Small Gaussian noise (σ = 0.01 V) is added to each waveform. Channel 1
    is enabled by default; channels 2–4 are disabled.

    Attributes:
        ip: IP address passed at construction (defaults to ``"127.0.0.1"``).
        port: Port number passed at construction (defaults to ``5025``).
    """

    def __init__(self, ip: str = "127.0.0.1", port: int = 5025) -> None:
        """Initialize the mock driver with default channel configurations.

        Args:
            ip: Simulated IP address. Defaults to ``"127.0.0.1"``.
            port: Simulated port number. Defaults to ``5025``.
        """
        super().__init__(ip, port)
        self._connected = False
        self._running = False
        self._stop_time: float = 0.0  # wall-clock time when stop() was last called
        self._rng = np.random.default_rng(
            seed=42
        )  # shared RNG — not re-seeded per call
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

    def connect(self) -> None:
        """Mark the driver as connected (no-op for mock)."""
        self._connected = True

    def disconnect(self) -> None:
        """Mark the driver as disconnected (no-op for mock)."""
        self._connected = False

    def identify(self) -> InstrumentInfo:
        """Return a fixed mock instrument identity string.

        Returns:
            An :class:`~app.instruments.base_driver.InstrumentInfo` with a
            hard-coded IDN string identifying this as a mock device.
        """
        return InstrumentInfo(
            idn="MOCK,MockScope,SN000001,FW1.0",
            ip=self.ip,
            firmware="FW1.0",
        )

    def run(self) -> None:
        """Set the internal running flag to ``True`` (no-op for mock)."""
        self._running = True

    def stop(self) -> None:
        """Freeze the waveform at the current wall-clock instant.

        Records the stop time so that subsequent :meth:`acquire_waveform` calls
        return the same frozen waveform until :meth:`run` is called again.
        """
        self._running = False
        self._stop_time = time.time()

    def acquire_waveform(self, channel: int) -> WaveformData:
        """Generate a synthetic sine-wave waveform for the requested channel.

        Produces 10,000 samples at 1 GHz sample rate (10 µs window) with a
        channel-specific sine frequency and small random noise.

        When the scope is running (``_running=True``) the waveform phase advances
        with wall-clock time, so successive ACQUIRE calls show different snapshots.
        When stopped, the waveform is frozen at the time :meth:`stop` was called.

        Args:
            channel: 1-based channel number (1–4).

        Returns:
            A :class:`~app.instruments.base_driver.WaveformData` containing the
            computed time and voltage arrays.
        """
        # Derive window from the stored timebase (10 divisions wide).
        num_divs = 10
        window_s = self._timebase.scale_s_div * num_divs
        sample_rate = 1e6  # 1 MSa/s — realistic for general use
        record_length = min(max(1000, int(sample_rate * window_s)), 100_000)

        freq_hz = 1e3 + (channel - 1) * 500  # 1 kHz, 1.5 kHz, 2 kHz, 2.5 kHz
        amplitude = self._channels[channel].scale_v_div * 3.0  # 3 divs peak

        # Use wall-clock time as phase origin when running; freeze when stopped.
        phase_time = time.time() if self._running else self._stop_time

        t = np.linspace(0, window_s, record_length, endpoint=False)
        v = amplitude * np.sin(2 * math.pi * freq_hz * (t + phase_time))
        # Add small noise — shared RNG advances each call so noise varies when running
        v = v + self._rng.normal(0, 0.01 * amplitude, size=record_length)

        return WaveformData(
            channel=channel,
            time_array=t,
            voltage_array=v,
            sample_rate=sample_rate,
            record_length=record_length,
            unit_x="s",
            unit_y="V",
        )

    def acquire_waveform_max(self, channel: int, progress_cb=None) -> WaveformData:
        """Generate a synthetic large-depth waveform simulating MAX mode.

        Returns 10× more samples than :meth:`acquire_waveform` and fires fake
        batch progress events so the SSE progress bar works in DEBUG mode.

        Args:
            channel: 1-based channel number (1–4).
            progress_cb: Optional callable invoked as ``progress_cb(batch, total)``.
        """
        num_divs = 10
        window_s = self._timebase.scale_s_div * num_divs * 10  # 10× wider window
        sample_rate = 1e6
        record_length = min(max(10_000, int(sample_rate * window_s)), 1_500_000)
        num_batches = max(1, (record_length + 249_999) // 250_000)

        freq_hz = 1e3 + (channel - 1) * 500
        amplitude = self._channels[channel].scale_v_div * 3.0
        phase_time = time.time() if self._running else self._stop_time

        t = np.linspace(0, window_s, record_length, endpoint=False)
        v = amplitude * np.sin(2 * math.pi * freq_hz * (t + phase_time))
        v = v + self._rng.normal(0, 0.01 * amplitude, size=record_length)

        for i in range(num_batches):
            if progress_cb:
                progress_cb(i + 1, num_batches)

        return WaveformData(
            channel=channel,
            time_array=t,
            voltage_array=v,
            sample_rate=sample_rate,
            record_length=record_length,
        )

    def get_screenshot(self) -> bytes:
        """Return a cached minimal valid white PNG image.

        Returns:
            Raw PNG bytes of a 640×480 white image. The image is generated
            once and cached for subsequent calls.
        """
        return _get_blank_png()

    def get_channel_config(self, channel: int) -> ChannelConfig:
        """Return the stored configuration for the specified channel.

        Args:
            channel: 1-based channel number (1–4).

        Returns:
            The :class:`~app.instruments.base_driver.ChannelConfig` for that channel.
        """
        return self._channels[channel]

    def get_timebase(self) -> TimebaseConfig:
        """Return the current mock timebase configuration.

        Returns:
            The :class:`~app.instruments.base_driver.TimebaseConfig` last set via
            :meth:`set_timebase`, or the default (1 µs/div, 0 offset, 1 GSa/s).
        """
        return self._timebase

    def get_trigger(self) -> TriggerConfig:
        """Return the current mock trigger configuration.

        Returns:
            The :class:`~app.instruments.base_driver.TriggerConfig` last set via
            :meth:`set_trigger`, or the default (CH1, 0 V, RISE, AUTO).
        """
        return self._trigger

    def set_channel_config(self, channel: int, config: ChannelConfig) -> None:
        """Store the given channel configuration.

        Args:
            channel: 1-based channel number (1–4).
            config: New :class:`~app.instruments.base_driver.ChannelConfig` to apply.
        """
        self._channels[channel] = config

    def set_timebase(self, config: TimebaseConfig) -> None:
        """Store the given timebase configuration.

        The waveform window generated by :meth:`acquire_waveform` uses
        ``record_length / sample_rate`` as its duration; changing
        ``scale_s_div`` here does not alter that window in the mock, but the
        stored value is returned faithfully by :meth:`get_timebase`.

        Args:
            config: New :class:`~app.instruments.base_driver.TimebaseConfig` to apply.
        """
        self._timebase = config

    def set_trigger(self, config: TriggerConfig) -> None:
        """Store the given trigger configuration.

        Args:
            config: New :class:`~app.instruments.base_driver.TriggerConfig` to apply.
        """
        self._trigger = config
