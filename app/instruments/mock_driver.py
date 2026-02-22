"""Mock oscilloscope driver for development and testing."""

import math

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
    """Return a minimal 1x1 white PNG."""
    import struct
    import zlib

    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
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
    """Synthetic oscilloscope driver returning sine wave data."""

    def __init__(self, ip: str = "127.0.0.1", port: int = 5025) -> None:
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
        self._connected = True

    def disconnect(self) -> None:
        self._connected = False

    def identify(self) -> InstrumentInfo:
        return InstrumentInfo(
            idn="MOCK,MockScope,SN000001,FW1.0",
            ip=self.ip,
            firmware="FW1.0",
        )

    def run(self) -> None:
        self._running = True

    def stop(self) -> None:
        self._running = False

    def acquire_waveform(self, channel: int) -> WaveformData:
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
        return _make_blank_png()

    def get_channel_config(self, channel: int) -> ChannelConfig:
        return self._channels[channel]

    def get_timebase(self) -> TimebaseConfig:
        return TimebaseConfig(scale_s_div=1e-6, offset_s=0.0, sample_rate=1e9)

    def get_trigger(self) -> TriggerConfig:
        return TriggerConfig(source="CH1", level_v=0.0, slope="RISE", mode="AUTO")
