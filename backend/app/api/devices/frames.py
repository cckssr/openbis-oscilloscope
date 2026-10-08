"""Blocking helpers that read a frame (all requested channels) from a driver.

These run in a worker thread (``asyncio.to_thread``); they never touch the
event loop or the buffer. The acquire endpoint stores the result only after the
whole frame has been read, so a cancelled or failed read leaves no partial
capture behind.
"""

import logging
import threading
from dataclasses import dataclass
from typing import Callable

from app.core.exceptions import AcquisitionCancelledError
from app.instruments.base_driver import BaseOscilloscopeDriver, WaveformData

logger = logging.getLogger(__name__)

# Errors of a single channel read that skip that channel instead of aborting.
CHANNEL_READ_ERRORS = (OSError, TimeoutError, ValueError, KeyError, RuntimeError)

# Signature of the overall-progress sink: ``(fraction_0_to_1, detail_text)``.
ProgressSink = Callable[[float, str], None]


@dataclass
class Frame:
    """The result of reading several channels at one instant.

    Attributes:
        channels: Per-channel settings (``AcquiredChannel`` shape) for the
            channels that were read successfully, aligned with ``waveforms``.
        waveforms: The sampled waveforms.
        timebase: Timebase (``scale_s_div``, ``offset_s``, ``sample_rate``) at capture time.
        trigger: Trigger (``source``, ``level_v``, ``slope``, ``mode``) at capture time.
    """

    channels: list[dict]
    waveforms: list[WaveformData]
    timebase: dict
    trigger: dict


def _mpkt(points: float) -> str:
    """Format a point count as mega-points with a decimal comma (``1,2``).

    Args:
        points: Number of points.

    Returns:
        The count in MPkt with one decimal, without a trailing ``,0``.
    """
    text = f"{points / 1e6:.1f}".replace(".", ",")
    return text[:-2] if text.endswith(",0") else text


def read_frame(
    driver: BaseOscilloscopeDriver,
    channels: list[int] | None,
    max_samples: bool,
    on_progress: ProgressSink | None = None,
    cancel_event: threading.Event | None = None,
) -> Frame:
    """Read the requested channels, one after another, from a driver.

    Settings (timebase, trigger, per-channel config) are read before the
    waveform so they describe the capture. Channels whose read fails with an
    I/O or value error are logged and skipped; cancellation aborts the whole
    frame.

    Args:
        driver: Connected driver (called from the current worker thread).
        channels: Channel numbers to read, or ``None`` for the channels enabled
            on the instrument.
        max_samples: Read the full acquisition memory instead of the screen buffer.
        on_progress: Receives overall progress (0..1 across all channels) and a
            detail text such as ``"CH2: 1,2 / 6 MPkt"``.
        cancel_event: When set, the read stops between blocks / channels.

    Returns:
        The :class:`Frame` with everything that was read.

    Raises:
        AcquisitionCancelledError: If ``cancel_event`` was set during the read.
    """
    channel_list = channels if channels else driver.get_available_channels()
    tb = driver.get_timebase()
    trig = driver.get_trigger()
    frame = Frame(
        channels=[],
        waveforms=[],
        timebase={
            "scale_s_div": tb.scale_s_div,
            "offset_s": tb.offset_s,
            "sample_rate": tb.sample_rate,
        },
        trigger={
            "source": trig.source,
            "level_v": trig.level_v,
            "slope": trig.slope,
            "mode": trig.mode,
        },
    )

    total_channels = len(channel_list)
    for index, ch in enumerate(channel_list):
        if cancel_event is not None and cancel_event.is_set():
            raise AcquisitionCancelledError()

        def _on_block(
            done: int, total: int, _index: int = index, _ch: int = ch
        ) -> None:
            if on_progress is None or total <= 0:
                return
            fraction = (_index + done / total) / total_channels
            on_progress(fraction, f"CH{_ch}: {_mpkt(done)} / {_mpkt(total)} MPkt")

        try:
            cfg = driver.get_channel_config(ch)
            driver.bind_job_hooks(_on_block, cancel_event)
            waveform = driver.acquire_waveform(ch, max_samples)
        except CHANNEL_READ_ERRORS as exc:
            logger.error(
                "Failed to read channel %d; skipping channel. Error: %s", ch, exc
            )
            continue
        finally:
            driver.unbind_job_hooks()

        frame.waveforms.append(waveform)
        frame.channels.append(
            {
                "channel": ch,
                "enabled": cfg.enabled,
                "scale_v_div": cfg.scale_v_div,
                "offset_v": cfg.offset_v,
                "coupling": cfg.coupling,
                "probe_attenuation": cfg.probe_attenuation,
            }
        )

    if on_progress is not None and frame.waveforms:
        on_progress(1.0, "")
    return frame


def waveform_payload(waveform: WaveformData, artifact_id: str | None) -> dict:
    """Serialise a waveform for ``waveforms`` in preview / acquire responses.

    Args:
        waveform: The sampled waveform.
        artifact_id: Stored artifact ID, or ``None`` for unsaved preview frames.

    Returns:
        ``{"artifact_id", "channel", "time_s", "voltage_V"}`` with plain lists.
    """
    return {
        "artifact_id": artifact_id,
        "channel": waveform.channel,
        "time_s": waveform.time_array.tolist(),
        "voltage_V": waveform.voltage_array.tolist(),
    }
