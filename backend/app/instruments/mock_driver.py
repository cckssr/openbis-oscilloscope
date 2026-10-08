"""Mock oscilloscope driver for development (``DEBUG=True``) and automated tests.

The mock behaves like a small four-channel scope that is connected to a signal
generator and an RC low-pass, so students (and tests) can measure peak-to-peak
voltage, frequency and phase:

======= ================================================================
Channel Signal
======= ================================================================
CH1     1 kHz sine, 2 Vpp (amplitude 1 V), the phase reference
CH2     1 kHz sine, 1 Vpp, lagging CH1 by 45 degrees (RC output)
CH3     500 Hz square wave, 3 Vpp
CH4     2 kHz triangle wave, 2 Vpp
======= ================================================================

Every ``set_*`` call changes what the following reads return: the time window
is ``10 x scale_s_div`` centred on ``offset_s``, the trigger source / level /
slope shift the waveform so that the chosen edge sits at ``t = 0``, a channel's
vertical scale / offset clip the trace at +-5 divisions around the offset, and
disabled channels are not returned by :meth:`get_available_channels`.
"""

import math
import struct
import time
import zlib
from dataclasses import replace

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

# kind, frequency [Hz], amplitude [V], phase lag [rad]
_SIGNALS: dict[int, tuple[str, float, float, float]] = {
    1: ("sine", 1_000.0, 1.0, 0.0),
    2: ("sine", 1_000.0, 0.5, math.radians(45.0)),
    3: ("square", 500.0, 1.5, 0.0),
    4: ("triangle", 2_000.0, 1.0, 0.0),
}

_NOISE_SIGMA_V = 0.005  # Gaussian noise added to every sample
_CLIP_DIVISIONS = 5.0  # ADC range around the channel centre, in divisions
_NUM_DIVISIONS = 10  # horizontal divisions on screen


def _make_blank_png() -> bytes:
    """Build a minimal valid 640x480 white PNG image in pure Python.

    Constructs the binary PNG from scratch using only the standard library
    (``struct`` and ``zlib``), so no Pillow or other imaging library is required.

    Returns:
        Raw PNG file bytes for a 640x480 24-bit white image.
    """

    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        """Encode a single PNG chunk with length, type, data, and CRC.

        Args:
            chunk_type: Four-byte PNG chunk type identifier (e.g. ``b"IHDR"``).
            data: Raw chunk payload bytes.

        Returns:
            The complete chunk bytes including length prefix and CRC suffix.
        """
        chunk_data = chunk_type + data
        crc = zlib.crc32(chunk_data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + chunk_data + struct.pack(">I", crc)

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = png_chunk(b"IHDR", struct.pack(">IIBBBBB", 640, 480, 8, 2, 0, 0, 0))
    raw_row = b"\x00" + b"\xff\xff\xff" * 640
    idat = png_chunk(b"IDAT", zlib.compress(raw_row * 480))
    iend = png_chunk(b"IEND", b"")
    return signature + ihdr + idat + iend


def _get_blank_png() -> bytes:
    """Return a cached blank PNG, building it once on first call."""
    global _BLANK_PNG
    if _BLANK_PNG is None:
        _BLANK_PNG = _make_blank_png()
    return _BLANK_PNG


def _nearest_125(value: float) -> float:
    """Round a positive value to the nearest 1-2-5 step on a log scale.

    Args:
        value: Positive number (e.g. a wanted volts-per-division).

    Returns:
        The closest value of the form ``{1, 2, 5} x 10^n``.
    """
    exponent = math.floor(math.log10(value))
    candidates = [m * 10.0**e for e in (exponent, exponent + 1) for m in (1, 2, 5)]
    return min(candidates, key=lambda c: abs(math.log(c / value)))


def _waveform(kind: str, frequency: float, amplitude: float, lag: float, t):
    """Evaluate one ideal test signal.

    Args:
        kind: ``"sine"``, ``"square"`` or ``"triangle"``.
        frequency: Signal frequency in Hz.
        amplitude: Peak amplitude in volts.
        lag: Phase lag in radians (positive values delay the signal).
        t: Time values in seconds (scalar or array).

    Returns:
        The signal voltage at each ``t``.
    """
    phase = 2.0 * math.pi * frequency * np.asarray(t, dtype=float) - lag
    s = np.sin(phase)
    if kind == "square":
        return amplitude * np.where(s >= 0.0, 1.0, -1.0)
    if kind == "triangle":
        return amplitude * (2.0 / math.pi) * np.arcsin(s)
    return amplitude * s


class MockOscilloscopeDriver(BaseOscilloscopeDriver):
    """Synthetic four-channel oscilloscope that generates test signals in memory.

    Intended for local development (``DEBUG=True``) and automated tests. No real
    network connection is made. See the module docstring for the generated
    signals; all four channels are enabled at 1 V/div with a default timebase
    of 500 us/div (5 ms window, five periods of the 1 kHz signals).

    Normal reads return :attr:`SCREEN_POINTS` samples; ``max_samples=True``
    reads :attr:`max_depth` samples block-wise, sleeping :attr:`block_delay_s`
    per block and calling :meth:`report_progress` / :meth:`raise_if_cancelled`
    between blocks, so the progress and cancel paths can be exercised without
    hardware.

    Attributes:
        ip: IP address passed at construction (defaults to ``"127.0.0.1"``).
        port: Port number passed at construction (defaults to ``5025``).
        max_depth: Samples returned by a full-memory (``max_samples``) read.
        block_size: Samples generated per block of a full-memory read.
        block_delay_s: Seconds slept after each block of a full-memory read.
        command_log: Names of the run/stop/single/force_trigger/autoscale calls
            received, in order (handy for assertions in tests).
    """

    supports_cancel_acquire = True
    SCREEN_POINTS = 1200

    def __init__(
        self,
        ip: str = "127.0.0.1",
        port: int = 5025,
        max_depth: int = 300_000,
        block_size: int = 50_000,
        block_delay_s: float = 0.1,
    ) -> None:
        """Initialize the mock driver with default channel configurations.

        Args:
            ip: Simulated IP address. Defaults to ``"127.0.0.1"``.
            port: Simulated port number. Defaults to ``5025``.
            max_depth: Samples of a full-memory read.
            block_size: Samples per block of a full-memory read.
            block_delay_s: Sleep per block of a full-memory read.
        """
        super().__init__(ip, port)
        self.max_depth = max_depth
        self.block_size = block_size
        self.block_delay_s = block_delay_s
        self.command_log: list[str] = []
        self._connected = False
        self._running = True
        self._rng = np.random.default_rng(seed=42)
        self._free_run_fraction = 0.0  # trigger phase when no edge is found
        self._channels: dict[int, ChannelConfig] = {
            ch: ChannelConfig(
                channel=ch,
                enabled=True,
                scale_v_div=1.0,
                offset_v=0.0,
                coupling="DC",
                probe_attenuation=1.0,
            )
            for ch in range(1, self.channel_count + 1)
        }
        self._timebase = TimebaseConfig(
            scale_s_div=5e-4, offset_s=0.0, sample_rate=self.SCREEN_POINTS / 5e-3
        )
        self._trigger = TriggerConfig(
            source="CH1", level_v=0.0, slope="RISE", mode="AUTO"
        )
        self._keyboard_locked = False

    # ------------------------------------------------------------------
    # Connection / identity / run control
    # ------------------------------------------------------------------

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
            idn="MOCK,MockScope,SN000001,FW1.0", ip=self.ip, firmware="FW1.0"
        )

    def run(self) -> None:
        """Start continuous acquisition (sets the internal running flag)."""
        self._running = True
        self._free_run_fraction = float(self._rng.uniform())
        self.command_log.append("run")

    def stop(self) -> None:
        """Stop acquisition (clears the internal running flag)."""
        self._running = False
        self.command_log.append("stop")

    def single(self) -> None:
        """Arm a single acquisition: trigger mode becomes ``SINGLE`` and the scope stops."""
        self._trigger = replace(self._trigger, mode="SINGLE")
        self._running = False
        self.command_log.append("single")

    def force_trigger(self) -> None:
        """Force a trigger event (recorded in :attr:`command_log`; reads are always valid)."""
        self.command_log.append("force_trigger")

    def autoscale(self) -> None:
        """Mimic the scope's Auto-Setup for the generated test signals.

        Enables all channels, centres them (offset 0), picks the nearest 1-2-5
        volts-per-division that shows each signal at about six divisions
        peak-to-peak, sets the timebase to show about three periods of the
        CH1 signal, and triggers on CH1 (rising, level 0, AUTO).
        """
        _, frequency, _, _ = _SIGNALS[1]
        scale_s = _nearest_125(3.0 / frequency / _NUM_DIVISIONS)
        self._timebase = TimebaseConfig(
            scale_s_div=scale_s,
            offset_s=0.0,
            sample_rate=self.SCREEN_POINTS / (scale_s * _NUM_DIVISIONS),
        )
        for ch in self._channels:
            amplitude = _SIGNALS[ch][2]
            self._channels[ch] = ChannelConfig(
                channel=ch,
                enabled=True,
                scale_v_div=_nearest_125(2.0 * amplitude / 6.0),
                offset_v=0.0,
                coupling="DC",
                probe_attenuation=1.0,
            )
        self._trigger = TriggerConfig(
            source="CH1", level_v=0.0, slope="RISE", mode="AUTO"
        )
        self._running = True
        self.command_log.append("autoscale")

    # ------------------------------------------------------------------
    # Waveform generation
    # ------------------------------------------------------------------

    def _trigger_shift(self) -> float:
        """Return the time shift that puts the trigger edge at ``t = 0``.

        The trigger source is sampled over one period; the first crossing of
        the trigger level with the configured slope defines the shift. If the
        level is never crossed, ``AUTO`` mode free-runs with a fixed random
        phase (re-drawn on :meth:`run` and :meth:`set_trigger`), other modes
        keep the signal phase at zero.

        Returns:
            The shift in seconds to add to the time axis before evaluating the
            signals.
        """
        trig = self._trigger
        source = trig.source.upper()
        channel = (
            int(source[2:]) if source.startswith("CH") and source[2:].isdigit() else 1
        )
        kind, frequency, amplitude, lag = _SIGNALS.get(channel, _SIGNALS[1])
        period = 1.0 / frequency
        t = np.linspace(0.0, period, 4097)
        v = _waveform(kind, frequency, amplitude, lag, t)
        prev, cur = v[:-1], v[1:]
        rising = (prev < trig.level_v) & (cur >= trig.level_v)
        falling = (prev >= trig.level_v) & (cur < trig.level_v)
        if trig.slope == "RISE":
            hits = rising
        elif trig.slope == "FALL":
            hits = falling
        else:
            hits = rising | falling
        idx = np.flatnonzero(hits)
        if idx.size == 0:
            return self._free_run_fraction * period if trig.mode == "AUTO" else 0.0
        i = int(idx[0])
        dv = cur[i] - prev[i]
        frac = (trig.level_v - prev[i]) / dv if dv else 0.0
        return float(t[i] + frac * (t[i + 1] - t[i]))

    def _voltage(self, channel: int, t, shift: float) -> np.ndarray:
        """Compute the measured voltage of one channel at the given times.

        Applies the channel's coupling (``GND`` reads zero; ``AC`` equals ``DC``
        because the test signals have no DC part), Gaussian noise and clipping
        to +-5 divisions around the channel offset.

        Args:
            channel: 1-based channel number.
            t: Time values relative to the trigger point, in seconds.
            shift: Result of :meth:`_trigger_shift`.

        Returns:
            Voltage samples in volts.
        """
        cfg = self._channels[channel]
        kind, frequency, amplitude, lag = _SIGNALS[channel]
        if cfg.coupling == "GND":
            v = np.zeros_like(t, dtype=float)
        else:
            v = _waveform(kind, frequency, amplitude, lag, np.asarray(t) + shift)
        v = v + self._rng.normal(0.0, _NOISE_SIGMA_V, size=v.shape)
        centre = -cfg.offset_v
        half_range = _CLIP_DIVISIONS * cfg.scale_v_div
        return np.clip(v, centre - half_range, centre + half_range)

    def acquire_waveform(self, channel: int, max_samples: bool = False) -> WaveformData:
        """Generate the current waveform of one channel.

        The time axis spans ``10 x scale_s_div`` centred on ``offset_s``. A
        normal read returns :attr:`SCREEN_POINTS` samples immediately. With
        ``max_samples=True`` it returns :attr:`max_depth` samples, generated in
        blocks of :attr:`block_size` with :attr:`block_delay_s` between them;
        :meth:`report_progress` and :meth:`raise_if_cancelled` are called around
        each block.

        Args:
            channel: 1-based channel number (1-4).
            max_samples: Simulate a full-memory read.

        Returns:
            The sampled waveform (time axis relative to the trigger point).

        Raises:
            ValueError: If ``channel`` is not 1-4.
            AcquisitionCancelledError: If the read is cancelled between blocks.
        """
        if channel not in self._channels:
            raise ValueError(f"Channel must be 1-{self.channel_count}, got {channel}")

        tb = self._timebase
        window = tb.scale_s_div * _NUM_DIVISIONS
        n = self.max_depth if max_samples else self.SCREEN_POINTS
        dt = window / n
        t = tb.offset_s - window / 2.0 + np.arange(n) * dt
        shift = self._trigger_shift()

        if not max_samples:
            v = self._voltage(channel, t, shift)
        else:
            v = np.empty(n)
            self.report_progress(0, n)
            for start in range(0, n, self.block_size):
                self.raise_if_cancelled()
                stop = min(start + self.block_size, n)
                v[start:stop] = self._voltage(channel, t[start:stop], shift)
                if self.block_delay_s:
                    time.sleep(self.block_delay_s)
                self.report_progress(stop, n)
            self.raise_if_cancelled()

        return WaveformData(
            channel=channel,
            time_array=t,
            voltage_array=v,
            sample_rate=1.0 / dt,
            record_length=n,
        )

    def acquire_waveform_max(self, channel: int) -> WaveformData:
        """Delegate to :meth:`acquire_waveform` with ``max_samples=True``."""
        return self.acquire_waveform(channel, max_samples=True)

    def get_screenshot(self) -> bytes:
        """Return a cached minimal valid white PNG image.

        Returns:
            Raw PNG bytes of a 640x480 white image. The image is generated
            once and cached for subsequent calls.
        """
        return _get_blank_png()

    # ------------------------------------------------------------------
    # Settings
    # ------------------------------------------------------------------

    def get_channel_config(self, channel: int) -> ChannelConfig:
        """Return the stored configuration for the specified channel.

        Args:
            channel: 1-based channel number (1-4).

        Returns:
            The :class:`~app.instruments.base_driver.ChannelConfig` for that channel.
        """
        return self._channels[channel]

    def get_timebase(self) -> TimebaseConfig:
        """Return the current timebase, with the sample rate derived from it.

        Returns:
            A :class:`~app.instruments.base_driver.TimebaseConfig` whose
            ``sample_rate`` is :attr:`SCREEN_POINTS` divided by the window.
        """
        tb = self._timebase
        window = tb.scale_s_div * _NUM_DIVISIONS
        return TimebaseConfig(
            scale_s_div=tb.scale_s_div,
            offset_s=tb.offset_s,
            sample_rate=self.SCREEN_POINTS / window,
        )

    def get_trigger(self) -> TriggerConfig:
        """Return the current trigger configuration.

        Returns:
            The :class:`~app.instruments.base_driver.TriggerConfig` last set via
            :meth:`set_trigger` (default: CH1, 0 V, RISE, AUTO).
        """
        return self._trigger

    def set_channel_config(self, channel: int, config: ChannelConfig) -> None:
        """Store the given channel configuration.

        Args:
            channel: 1-based channel number (1-4).
            config: New :class:`~app.instruments.base_driver.ChannelConfig` to apply.

        Raises:
            ValueError: If ``channel`` is not 1-4 or the vertical scale is not positive.
        """
        if channel not in self._channels:
            raise ValueError(f"Channel must be 1-{self.channel_count}, got {channel}")
        if config.scale_v_div <= 0:
            raise ValueError("scale_v_div must be positive")
        self._channels[channel] = replace(config, channel=channel)

    def set_timebase(self, config: TimebaseConfig) -> None:
        """Store the given timebase (scale and offset; the sample rate is derived).

        Args:
            config: New :class:`~app.instruments.base_driver.TimebaseConfig` to apply.

        Raises:
            ValueError: If ``scale_s_div`` is not positive.
        """
        if config.scale_s_div <= 0:
            raise ValueError("scale_s_div must be positive")
        self._timebase = replace(config)

    def set_trigger(self, config: TriggerConfig) -> None:
        """Store the given trigger configuration.

        Args:
            config: New :class:`~app.instruments.base_driver.TriggerConfig` to apply.
        """
        self._trigger = replace(config)
        self._free_run_fraction = float(self._rng.uniform())

    def get_memory_depth(self) -> int:
        """Return the simulated acquisition memory depth in samples.

        Returns:
            :attr:`max_depth`, the number of samples a ``max_samples`` read returns.
        """
        return self.max_depth

    def set_keyboard_lock(self, locked: bool) -> None:
        """Remember the simulated front-panel key lock state.

        Args:
            locked: ``True`` to lock the keys; ``False`` to unlock.
        """
        self._keyboard_locked = locked
