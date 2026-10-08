"""Tests for the mock oscilloscope driver: realistic signals and settings effects."""

import math
import threading

import numpy as np
import pytest

from app.core.exceptions import AcquisitionCancelledError
from app.instruments.base_driver import (
    BaseOscilloscopeDriver,
    ChannelConfig,
    TimebaseConfig,
    TriggerConfig,
)
from app.instruments.mock_driver import MockOscilloscopeDriver


@pytest.fixture
def drv():
    d = MockOscilloscopeDriver(max_depth=20_000, block_size=5_000, block_delay_s=0.0)
    d.connect()
    return d


def _phasor(w, freq):
    return np.sum(w.voltage_array * np.exp(-2j * np.pi * freq * w.time_array))


def _frequency(w) -> float:
    """Estimate the frequency from rising zero crossings."""
    v, t = w.voltage_array, w.time_array
    idx = np.flatnonzero((v[:-1] < 0) & (v[1:] >= 0))
    return (len(idx) - 1) / (t[idx[-1]] - t[idx[0]])


def test_duplicate_mock_removed():
    """base_driver re-exports the one implementation that lives in mock_driver."""
    from app.instruments import base_driver

    assert base_driver.MockOscilloscopeDriver is MockOscilloscopeDriver


def test_capabilities_and_channel_count(drv):
    assert drv.channel_count == 4
    assert drv.capabilities == [
        "run",
        "stop",
        "acquire",
        "preview",
        "screenshot",
        "single",
        "force_trigger",
        "autoscale",
        "cancel_acquire",
    ]


def test_ch1_is_1khz_sine_2vpp(drv):
    w = drv.acquire_waveform(1)
    assert w.record_length == drv.SCREEN_POINTS == len(w.voltage_array)
    assert np.ptp(w.voltage_array) == pytest.approx(2.0, abs=0.1)
    assert _frequency(w) == pytest.approx(1000.0, rel=0.02)


def test_ch2_is_half_amplitude_with_45_degree_lag(drv):
    w1, w2 = drv.acquire_waveform(1), drv.acquire_waveform(2)
    assert np.ptp(w2.voltage_array) == pytest.approx(1.0, abs=0.1)
    lag = math.degrees(np.angle(_phasor(w1, 1000)) - np.angle(_phasor(w2, 1000)))
    assert lag == pytest.approx(45.0, abs=1.5)


def test_ch3_square_and_ch4_triangle(drv):
    sq = drv.acquire_waveform(3)
    assert _frequency(sq) == pytest.approx(500.0, rel=0.05)
    # a square wave spends nearly all samples near the rails
    near_rail = np.abs(np.abs(sq.voltage_array) - 1.5) < 0.1
    assert near_rail.mean() > 0.9
    tri = drv.acquire_waveform(4)
    assert _frequency(tri) == pytest.approx(2000.0, rel=0.05)
    assert np.ptp(tri.voltage_array) == pytest.approx(2.0, abs=0.1)


def test_time_window_follows_timebase_and_offset(drv):
    drv.set_timebase(TimebaseConfig(scale_s_div=1e-3, offset_s=2e-3, sample_rate=0))
    w = drv.acquire_waveform(1)
    assert w.time_array[0] == pytest.approx(2e-3 - 5e-3)
    assert w.time_array[-1] == pytest.approx(2e-3 + 5e-3, abs=1e-4)
    assert drv.get_timebase().scale_s_div == 1e-3
    assert drv.get_timebase().sample_rate == pytest.approx(1200 / 10e-3)
    assert w.sample_rate == pytest.approx(drv.get_timebase().sample_rate)


def test_channel_scale_clips_and_disable_hides_channel(drv):
    drv.set_channel_config(
        1,
        ChannelConfig(
            channel=1,
            enabled=True,
            scale_v_div=0.1,
            offset_v=0.0,
            coupling="DC",
            probe_attenuation=1.0,
        ),
    )
    w = drv.acquire_waveform(1)
    assert np.max(np.abs(w.voltage_array)) <= 0.5 + 1e-9  # 5 divisions * 0.1 V
    drv.set_channel_config(
        2,
        ChannelConfig(2, False, 1.0, 0.0, "DC", 1.0),
    )
    assert drv.get_available_channels() == [1, 3, 4]
    drv.set_channel_config(3, ChannelConfig(3, True, 1.0, 0.0, "GND", 1.0))
    assert np.ptp(drv.acquire_waveform(3).voltage_array) < 0.1


def test_trigger_level_and_slope_shift_the_waveform(drv):
    # rising edge through 0 V: the sine passes 0 V at t = 0
    rise = drv.acquire_waveform(1)
    i = int(np.argmin(np.abs(rise.time_array)))
    assert abs(rise.voltage_array[i]) < 0.1
    # falling edge: half a period later the sine passes 0 V downwards
    drv.set_trigger(TriggerConfig("CH1", 0.0, "FALL", "AUTO"))
    fall = drv.acquire_waveform(1)
    j = int(np.argmin(np.abs(fall.time_array)))
    assert abs(fall.voltage_array[j]) < 0.1
    assert fall.voltage_array[j + 3] < fall.voltage_array[j - 3]
    assert drv.get_trigger().slope == "FALL"
    # triggering at +0.5 V: the signal is 0.5 V at t = 0
    drv.set_trigger(TriggerConfig("CH1", 0.5, "RISE", "AUTO"))
    lvl = drv.acquire_waveform(1)
    k = int(np.argmin(np.abs(lvl.time_array)))
    assert lvl.voltage_array[k] == pytest.approx(0.5, abs=0.1)


def test_optional_commands_change_state(drv):
    drv.single()
    assert drv.get_trigger().mode == "SINGLE"
    drv.force_trigger()
    drv.set_timebase(TimebaseConfig(1.0, 0.0, 0.0))
    drv.autoscale()
    assert drv.get_timebase().scale_s_div == pytest.approx(2e-4)
    assert drv.get_trigger().mode == "AUTO"
    assert drv.command_log == ["single", "force_trigger", "autoscale"]


def test_max_read_reports_progress_in_blocks(drv):
    calls: list[tuple[int, int]] = []
    drv.bind_job_hooks(lambda d, t: calls.append((d, t)), None)
    w = drv.acquire_waveform(1, max_samples=True)
    assert w.record_length == 20_000
    assert calls == [
        (0, 20_000),
        (5_000, 20_000),
        (10_000, 20_000),
        (15_000, 20_000),
        (20_000, 20_000),
    ]


def test_max_read_stops_when_cancelled(drv):
    event = threading.Event()
    seen: list[int] = []

    def on_progress(done, total):
        seen.append(done)
        if done >= 10_000:
            event.set()

    drv.bind_job_hooks(on_progress, event)
    with pytest.raises(AcquisitionCancelledError):
        drv.acquire_waveform(1, max_samples=True)
    assert max(seen) == 10_000  # no block after the cancel


def test_base_driver_defaults_are_unsupported():
    class Bare(MockOscilloscopeDriver):
        single = BaseOscilloscopeDriver.single
        force_trigger = BaseOscilloscopeDriver.force_trigger
        autoscale = BaseOscilloscopeDriver.autoscale
        supports_cancel_acquire = False

    bare = Bare()
    assert bare.capabilities == ["run", "stop", "acquire", "preview", "screenshot"]
    with pytest.raises(NotImplementedError):
        bare.autoscale()
