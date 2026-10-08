"""Waveform reads: ``preview``, ``acquire`` (+ cancel) and the latest-channel-data lookup."""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import Depends, Path, Query, Request

from app.api.devices.common import (
    get_entry,
    get_locked_online_driver,
    get_services,
    make_router,
    verify_lock_ownership,
)
from app.api.devices.frames import Frame, read_frame, waveform_payload
from app.api.devices.progress import ProgressPublisher
from app.core.dependencies import get_current_user
from app.core.exceptions import (
    AcquisitionCancelledError,
    ArtifactNotFoundError,
    ValidationError,
)
from app.instruments.base_driver import BaseOscilloscopeDriver
from app.openbis_client.client import UserInfo

router = make_router()
logger = logging.getLogger(__name__)

_DEVICE_ID = Path(..., description="Device identifier.")
_SESSION_ID = Query(..., description="Control session UUID returned by /lock.")


def _validate_channels(
    channels: list[int] | None, driver: BaseOscilloscopeDriver
) -> list[int] | None:
    """Check requested channel numbers against the driver's channel count.

    Args:
        channels: Requested channels, or ``None``/empty for "enabled channels".
        driver: The connected driver.

    Returns:
        The de-duplicated list in request order, or ``None`` if none was requested.

    Raises:
        ValidationError: If a channel is outside ``1..channel_count``.
    """
    if not channels:
        return None
    bad = [c for c in channels if not 1 <= c <= driver.channel_count]
    if bad:
        raise ValidationError(
            f"Invalid channel(s) {bad}; this device has channels 1-{driver.channel_count}"
        )
    return list(dict.fromkeys(channels))


@router.post(
    "/{device_id}/preview",
    response_model=dict,
    summary="Preview live frame",
    response_description="One frame of the requested channels plus applied settings; nothing is stored.",
)
async def preview(
    request: Request,
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    channels: list[int] | None = Query(
        default=None,
        description="Channel numbers to read; defaults to the channels enabled on the scope.",
    ),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Read one live frame for display. Nothing is written to the archive.

    Returns:
        ``{channels, waveforms, timebase, trigger}`` where every waveform has
        ``artifact_id: null``.
    """
    manager, driver = await get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )
    channel_list = _validate_channels(channels, driver)

    async def _preview() -> Frame:
        return await asyncio.to_thread(read_frame, driver, channel_list, False)

    frame = await manager.execute_command(device_id, _preview, timeout=30.0)
    return {
        "channels": frame.channels,
        "waveforms": [waveform_payload(w, None) for w in frame.waveforms],
        "timebase": frame.timebase,
        "trigger": frame.trigger,
    }


@router.post(
    "/{device_id}/acquire",
    response_model=dict,
    summary="Acquire waveforms",
    response_description="Stored artifact identifiers, applied settings and (optionally) the data.",
)
async def acquire(
    request: Request,
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    channels: list[int] | None = Query(
        default=None,
        description="Optional list of channel numbers to acquire.",
    ),
    max_samples: bool = Query(
        default=False,
        description="Whether to acquire the maximum number of samples available on the device. "
        "If false, the driver may apply a default decimation to fit the waveform into memory.",
    ),
    run_id: str | None = Query(
        default=None,
        description="Optional UUID grouping acquisitions from one series.",
    ),
    include_data: bool = Query(
        default=False,
        description="Also return the sample arrays (saves one request per channel).",
    ),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Acquire waveforms and store them as one capture ("Aufnahme").

    All channels are read first and stored afterwards, so a cancelled or failed
    full-memory read leaves nothing in the archive. While reading with
    ``max_samples=true`` ``progress`` events are published on the SSE stream;
    ``POST .../acquire/cancel`` aborts the read.

    Returns:
        ``artifact_ids``, ``acquisition_id``, ``session_id``, ``created_at``
        (ISO UTC), ``channels``, ``timebase``, ``trigger`` and, with
        ``include_data``, ``waveforms`` (with real ``artifact_id`` values).

    Raises:
        AcquisitionCancelledError: HTTP 409 ``acquisition_cancelled`` when the
            read was cancelled.
    """
    manager, driver = await get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )
    channel_list = _validate_channels(channels, driver)
    buffer_service = request.app.state.buffer_service
    progress = ProgressPublisher(
        getattr(request.app.state, "event_bus", None),
        asyncio.get_running_loop(),
        device_id,
        session_id,
    )
    job = manager.jobs.start(device_id, session_id)

    async def _acquire() -> dict | None:
        try:
            frame = await asyncio.to_thread(
                read_frame,
                driver,
                channel_list,
                max_samples,
                progress if max_samples else None,
                job.cancel_event,
            )
        except AcquisitionCancelledError:
            return None  # not an error for the device worker (no ERROR state)
        if job.cancelled:
            return None

        acquisition_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        artifact_ids = []
        for waveform, cfg in zip(frame.waveforms, frame.channels):
            meta = {
                "channel": waveform.channel,
                "sample_rate": waveform.sample_rate,
                "record_length": waveform.record_length,
                "unit_x": waveform.unit_x,
                "unit_y": waveform.unit_y,
                "scale_v_div": cfg["scale_v_div"],
                "offset_v": cfg["offset_v"],
                "coupling": cfg["coupling"],
                "probe_attenuation": cfg["probe_attenuation"],
                "timebase": frame.timebase,
                "trigger": frame.trigger,
                **({"waveform_mode": "MAX"} if max_samples else {}),
            }
            artifact_ids.append(
                await asyncio.to_thread(
                    buffer_service.store_waveform,
                    device_id,
                    session_id,
                    waveform,
                    meta,
                    acquisition_id=acquisition_id,
                    run_id=run_id,
                    created_at=created_at,
                )
            )

        result = {
            "artifact_ids": artifact_ids,
            "acquisition_id": acquisition_id,
            "session_id": session_id,
            "created_at": created_at,
            "channels": frame.channels,
            "timebase": frame.timebase,
            "trigger": frame.trigger,
        }
        if include_data:
            result["waveforms"] = [
                waveform_payload(w, art_id)
                for w, art_id in zip(frame.waveforms, artifact_ids)
            ]
        return result

    timeout = 120.0 if max_samples else 60.0
    try:
        result = await manager.execute_command(device_id, _acquire, timeout=timeout)
    finally:
        manager.jobs.finish(job)
    if result is None:
        raise AcquisitionCancelledError()
    return result


@router.post(
    "/{device_id}/acquire/cancel",
    response_model=dict,
    summary="Cancel running acquisition",
    response_description="Whether an acquisition was running and has been asked to stop.",
)
async def cancel_acquire(
    request: Request,
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Ask the running acquisition of this session to stop between blocks.

    This endpoint deliberately bypasses the device queue (which is busy with the
    acquisition) and only sets a cancel flag. The acquire request then fails
    with HTTP 409 ``acquisition_cancelled`` and stores nothing.

    Returns:
        ``{"cancelled": true}`` if an acquisition was running or queued,
        ``{"cancelled": false}`` otherwise.
    """
    manager, lock_service = get_services(request)
    get_entry(manager, device_id)
    lock = await lock_service.get_lock(device_id)
    verify_lock_ownership(lock, user.user_id, session_id, device_id)
    return {"cancelled": manager.jobs.cancel(device_id, session_id)}


@router.get(
    "/{device_id}/channels/{channel}/data",
    response_model=dict,
    summary="Get channel data",
    response_description="The latest stored waveform for the requested channel.",
)
async def get_channel_data(
    request: Request,
    device_id: str = _DEVICE_ID,
    channel: int = Path(..., description="1-based channel number."),
    session_id: str = _SESSION_ID,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Return the most recent stored waveform for a channel as JSON arrays."""
    manager, lock_service = get_services(request)
    buffer_service = request.app.state.buffer_service
    get_entry(manager, device_id)

    lock = await lock_service.get_lock(device_id)
    verify_lock_ownership(lock, user.user_id, session_id, device_id)

    artifacts = buffer_service.list_artifacts(session_id)
    matching = [
        a for a in artifacts if a.artifact_type == "trace" and a.channel == channel
    ]
    if not matching:
        raise ArtifactNotFoundError(f"No data for channel {channel}")

    latest = max(matching, key=lambda a: a.seq)
    paths = buffer_service.get_artifact_paths(session_id, latest.artifact_id)
    csv_path = next((p for p in paths if p.suffix == ".csv"), None)
    if csv_path is None:
        raise ArtifactNotFoundError(latest.artifact_id)

    times, volts = buffer_service.read_trace_csv(csv_path)

    return {
        "artifact_id": latest.artifact_id,
        "channel": channel,
        "time_s": times,
        "voltage_V": volts,
    }
