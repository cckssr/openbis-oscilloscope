"""Mock oscilloscope driver for development and testing."""

import math
import struct
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
        self._channels: dict[int, ChannelConfig] = {
            ch: ChannelConfig(
                channel=ch,
                enabled=(ch == 1),
                scale_v_div=1.0,
                offset_v=0.0,
                coupling="DC",
                probe_attenuation=1.0,
            )
            for ch in range(1, 5)
        }

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
        """Set the internal running flag to ``False`` (no-op for mock)."""
        self._running = False

    def acquire_waveform(self, channel: int) -> WaveformData:
        """Generate a synthetic sine-wave waveform for the requested channel.

        Produces 10,000 samples at 1 GHz sample rate (10 µs window) with a
        channel-specific sine frequency and small random noise.

        Args:
            channel: 1-based channel number (1–4).

        Returns:
            A :class:`~app.instruments.base_driver.WaveformData` containing the
            computed time and voltage arrays.
        """
        sample_rate = 1e9
        record_length = 10_000
        freq_hz = 1e3 + (channel - 1) * 500  # 1kHz, 1.5kHz, 2kHz, 2.5kHz per channel
        amplitude = 1.0

        t = np.linspace(0, record_length / sample_rate, record_length, endpoint=False)
        v = amplitude * np.sin(2 * math.pi * freq_hz * t)
        # Add small noise
        rng = np.random.default_rng(seed=channel)
        v = v + rng.normal(0, 0.01, size=record_length)

        return WaveformData(
            channel=channel,
            time_array=t,
            voltage_array=v,
            sample_rate=sample_rate,
            record_length=record_length,
            unit_x="s",
            unit_y="V",
        )

    def get_screenshot(self) -> bytes:
        """Return a minimal valid white PNG image.

        Returns:
            Raw PNG bytes of a 640×480 white image generated by
            :func:`_make_blank_png`.
        """
        return _make_blank_png()

    def get_channel_config(self, channel: int) -> ChannelConfig:
        """Return the stored configuration for the specified channel.

        Args:
            channel: 1-based channel number (1–4).

        Returns:
            The :class:`~app.instruments.base_driver.ChannelConfig` for that channel.
        """
        return self._channels[channel]

    def get_timebase(self) -> TimebaseConfig:
        """Return a fixed mock timebase configuration.

        Returns:
            A :class:`~app.instruments.base_driver.TimebaseConfig` with
            1 µs/div scale, zero offset, and 1 GHz sample rate.
        """
        return TimebaseConfig(scale_s_div=1e-6, offset_s=0.0, sample_rate=1e9)

    def get_trigger(self) -> TriggerConfig:
        """Return a fixed mock trigger configuration.

        Returns:
            A :class:`~app.instruments.base_driver.TriggerConfig` set to
            CH1 source, 0 V level, rising edge, AUTO mode.
        """
        return TriggerConfig(source="CH1", level_v=0.0, slope="RISE", mode="AUTO")
