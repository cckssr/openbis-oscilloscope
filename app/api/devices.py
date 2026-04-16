"""API endpoints for device listing, lock management, and instrument commands."""

import asyncio
import time
import uuid

from fastapi import APIRouter, Body, Depends, Path, Query, Request
from fastapi.responses import Response

from app.core.dependencies import get_current_user
from app.core.exceptions import (
    DeviceNotFoundError,
    DeviceOfflineError,
    LockConflictError,
    LockRequiredError,
    ArtifactNotFoundError,
)
from app.instruments.manager import DeviceState, InstrumentManager, _load_driver_class
from app.instruments.base_driver import (
    BaseOscilloscopeDriver,
    TriggerConfig,
    ChannelConfig,
    TimebaseConfig,
)
from app.locks.service import LockService
from app.openbis_client.client import UserInfo

router = APIRouter(prefix="/devices", tags=["devices"])


def _get_services(request: Request) -> tuple[InstrumentManager, LockService]:
    """Extract the InstrumentManager and LockService from the application state.

    Args:
        request: The current HTTP request.

    Returns:
        A ``(instrument_manager, lock_service)`` tuple sourced from
        ``request.app.state``.
    """
    return request.app.state.instrument_manager, request.app.state.lock_service


# ---------------------------------------------------------------------------
# Device listing
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[dict],
    summary="List devices",
    response_description="All registered devices with their current lock state.",
)
async def list_devices(
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    """List all registered devices with their current lock metadata.

    The lock object exposes ``is_mine`` to indicate whether the authenticated
    user currently owns the lock. ``session_id`` is only returned to the lock
    owner.
    """
    manager, lock_service = _get_services(request)
    result = []
    for ds in manager.get_device_list():
        lock = await lock_service.get_lock(ds.id)
        lock_info = None
        if lock:
            is_mine = lock.owner_user == user.user_id
            lock_info = {
                "owner_user": lock.owner_user,
                "acquired_at": lock.acquired_at,
                "is_mine": is_mine,
                # Expose session_id only to the lock owner so they can reclaim control
                **({"session_id": lock.session_id} if is_mine else {}),
            }
        result.append(
            {
                "id": ds.id,
                "label": ds.label,
                "ip": ds.ip,
                "port": ds.port,
                "state": ds.state.value,
                "last_error": ds.last_error,
                "lock": lock_info,
            }
        )
    return result


@router.get(
    "/{device_id}",
    response_model=dict,
    summary="Get device details",
    response_description="Detailed device metadata and supported capabilities.",
)
async def get_device(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Return detailed information for one device and its capabilities.

    The ``capabilities`` field lists supported command names when a driver is
    connected and is empty when the device is offline.
    """
    manager, lock_service = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

    lock = await lock_service.get_lock(device_id)
    lock_info = None
    if lock:
        is_mine = lock.owner_user == user.user_id
        lock_info = {
            "owner_user": lock.owner_user,
            "acquired_at": lock.acquired_at,
            "is_mine": is_mine,
            # Expose session_id only to the lock owner so they can reclaim control
            **({"session_id": lock.session_id} if is_mine else {}),
        }

    capabilities = []
    if entry.driver is not None:
        capabilities = ["run", "stop", "acquire", "screenshot"]

    return {
        "id": entry.config.id,
        "label": entry.config.label,
        "ip": entry.config.ip,
        "port": entry.config.port,
        "state": entry.state.value,
        "last_error": entry.last_error,
        "lock": lock_info,
        "capabilities": capabilities,
    }


# ---------------------------------------------------------------------------
# Lock management
# ---------------------------------------------------------------------------


@router.post(
    "/{device_id}/lock",
    response_model=dict,
    summary="Acquire device lock",
    response_description="New control session identifier for the acquired lock.",
)
async def acquire_lock(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Acquire an exclusive control lock on a device.

    The returned ``control_session_id`` must be supplied to all lock-protected
    commands and refreshed periodically with ``/heartbeat``.
    """
    manager, lock_service = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

    if entry.state == DeviceState.OFFLINE:
        raise DeviceOfflineError(device_id)

    session_id = str(uuid.uuid4())
    acquired = await lock_service.acquire_lock(device_id, user.user_id, session_id)
    if not acquired:
        lock = await lock_service.get_lock(device_id)
        owner = lock.owner_user if lock else "unknown"
        raise LockConflictError(device_id, owner)

    manager.update_state(device_id, DeviceState.LOCKED)
    return {"control_session_id": session_id, "device_id": device_id}


@router.post(
    "/{device_id}/unlock",
    response_model=dict,
    summary="Release device lock",
    response_description="Confirmation that the lock was released.",
)
async def release_lock(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    session_id: str = Query(..., description="Control session UUID returned by /lock."),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Release the caller's exclusive lock on a device."""
    manager, lock_service = _get_services(request)
    try:
        manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

    released = await lock_service.release_lock(device_id, session_id)
    if not released:
        raise LockRequiredError(device_id)

    manager.update_state(device_id, DeviceState.ONLINE)
    return {"released": True}


@router.post(
    "/{device_id}/heartbeat",
    response_model=dict,
    summary="Renew device lock",
    response_description="Confirmation that the lock TTL was renewed.",
)
async def heartbeat(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    session_id: str = Query(..., description="Control session UUID returned by /lock."),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Renew the TTL on an existing device lock."""
    _, lock_service = _get_services(request)
    renewed = await lock_service.renew_lock(device_id, session_id)
    if not renewed:
        raise LockRequiredError(device_id)
    return {"renewed": True}


# ---------------------------------------------------------------------------
# Instrument commands (require lock)
# ---------------------------------------------------------------------------


def _verify_lock_ownership(lock, user_id: str, session_id: str, device_id: str) -> None:
    """Assert that the given user and session currently own the device lock.

    Args:
        lock: The current :class:`~app.locks.service.LockInfo`, or ``None`` if
            the device is unlocked.
        user_id: Authenticated user's ID to verify against ``lock.owner_user``.
        session_id: Control session UUID to verify against ``lock.session_id``.
        device_id: Device identifier included in the error message if the check fails.

    Raises:
        LockRequiredError: If ``lock`` is ``None``, the session ID does not match,
            or the user ID does not match.
    """
    if lock is None or lock.session_id != session_id or lock.owner_user != user_id:
        raise LockRequiredError(device_id)


async def _get_locked_online_driver(
    request: Request,
    device_id: str,
    user_id: str,
    session_id: str,
) -> tuple[InstrumentManager, BaseOscilloscopeDriver]:
    """Return manager and driver after device, lock, and online-state validation.

    Raises:
        DeviceNotFoundError: If ``device_id`` is unknown.
        LockRequiredError: If lock ownership does not match ``user_id`` and
            ``session_id``.
        DeviceOfflineError: If no active driver is connected.
    """
    manager, lock_service = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

    lock = await lock_service.get_lock(device_id)
    _verify_lock_ownership(lock, user_id, session_id, device_id)

    if entry.driver is None:
        raise DeviceOfflineError(device_id)

    return manager, entry.driver


@router.post(
    "/{device_id}/run",
    response_model=dict,
    summary="Start acquisition",
    response_description="Confirmation that continuous acquisition is running.",
)
async def run_device(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    session_id: str = Query(..., description="Control session UUID returned by /lock."),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Start continuous acquisition on the device."""
    manager, driver = await _get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )

    async def _run():
        driver.run()

    await manager.execute_command(device_id, _run)
    return {"status": "running"}


@router.post(
    "/{device_id}/stop",
    response_model=dict,
    summary="Stop acquisition",
    response_description="Confirmation that acquisition was stopped.",
)
async def stop_device(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    session_id: str = Query(..., description="Control session UUID returned by /lock."),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Stop acquisition on the device."""
    manager, driver = await _get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )

    async def _stop():
        driver.stop()

    await manager.execute_command(device_id, _stop)
    return {"status": "stopped"}


@router.post(
    "/{device_id}/acquire",
    response_model=dict,
    summary="Acquire waveforms",
    response_description="Stored artifact identifiers and per-channel metadata.",
)
async def acquire(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    session_id: str = Query(..., description="Control session UUID returned by /lock."),
    channels: list[int] | None = Query(
        default=None,
        description="Optional list of channel numbers to acquire.",
    ),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Acquire waveforms from enabled channels and store the artifacts.

    The optional ``channels`` filter limits acquisition to the requested
    channels after intersecting with the channels that are enabled on the
    instrument.
    """
    manager, driver = await _get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )
    buffer_service = request.app.state.buffer_service

    async def _acquire():
        artifact_ids = []
        acquired_channels = []

        # Ask the driver which channels are currently enabled on the scope.
        # get_available_channels() uses one lightweight query per channel
        # (DISPlay? only) rather than reading the full config for every channel.
        # If the caller passed an explicit channel list, filter to those that
        # are actually enabled so we never try to acquire a disabled channel.
        enabled_on_scope = driver.get_available_channels()
        channel_list = (
            [ch for ch in channels if ch in enabled_on_scope]
            if channels
            else enabled_on_scope
        )
        for ch in channel_list:
            try:
                cfg = driver.get_channel_config(ch)
                waveform = driver.acquire_waveform(ch)
            except (OSError, TimeoutError, ValueError, KeyError, RuntimeError):
                continue

            meta = {
                "channel": waveform.channel,
                "sample_rate": waveform.sample_rate,
                "record_length": waveform.record_length,
                "unit_x": waveform.unit_x,
                "unit_y": waveform.unit_y,
                "scale_v_div": cfg.scale_v_div,
            }
            art_id = buffer_service.store_waveform(
                device_id, session_id, waveform, meta
            )
            artifact_ids.append(art_id)
            acquired_channels.append(
                {
                    "channel": ch,
                    "enabled": cfg.enabled,
                    "scale_v_div": cfg.scale_v_div,
                    "offset_v": cfg.offset_v,
                    "coupling": cfg.coupling,
                    "probe_attenuation": cfg.probe_attenuation,
                }
            )

        return {"artifact_ids": artifact_ids, "channels": acquired_channels}

    result = await manager.execute_command(device_id, _acquire, timeout=60.0)
    return {
        "artifact_ids": result["artifact_ids"],
        "session_id": session_id,
        "channels": result["channels"],
    }


@router.get(
    "/{device_id}/channels/{channel}/data",
    response_model=dict,
    summary="Get channel data",
    response_description="The latest waveform for the requested channel.",
)
async def get_channel_data(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    channel: int = Path(..., description="1-based channel number."),
    session_id: str = Query(..., description="Control session UUID returned by /lock."),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Return the most recent waveform for a channel as JSON arrays."""
    manager, lock_service = _get_services(request)
    buffer_service = request.app.state.buffer_service

    try:
        manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

    lock = await lock_service.get_lock(device_id)
    _verify_lock_ownership(lock, user.user_id, session_id, device_id)

    # Find most recent trace artifact for this channel
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


@router.get(
    "/{device_id}/settings",
    response_model=dict,
    summary="Get device settings",
    response_description="Current channel, timebase, and trigger settings.",
)
async def get_settings(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Return the current instrument settings as a single snapshot."""
    manager, _ = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

    if entry.driver is None:
        raise DeviceOfflineError(device_id)

    driver = entry.driver

    async def _get():
        channels = {}
        for ch in range(1, 5):
            try:
                cfg = driver.get_channel_config(ch)
                channels[ch] = {
                    "enabled": cfg.enabled,
                    "scale_v_div": cfg.scale_v_div,
                    "offset_v": cfg.offset_v,
                    "coupling": cfg.coupling,
                    "probe_attenuation": cfg.probe_attenuation,
                }
            except (OSError, TimeoutError, ValueError, KeyError, RuntimeError):
                pass
        tb = driver.get_timebase()
        trig = driver.get_trigger()
        return {
            "channels": channels,
            "timebase": {
                "scale_s_div": tb.scale_s_div,
                "offset_s": tb.offset_s,
                "sample_rate": tb.sample_rate,
            },
            "trigger": {
                "source": trig.source,
                "level_v": trig.level_v,
                "slope": trig.slope,
                "mode": trig.mode,
            },
        }

    return await manager.execute_command(device_id, _get)


@router.put(
    "/{device_id}/channels/{channel}/config",
    response_model=dict,
    summary="Set channel config",
    response_description="Confirmation that the channel configuration was applied.",
)
async def set_channel_config(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    channel: int = Path(..., description="1-based channel number."),
    session_id: str = Query(..., description="Control session UUID returned by /lock."),
    config: dict = Body(
        ..., description="Channel configuration payload for the selected channel."
    ),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Apply a channel configuration to the instrument."""
    manager, driver = await _get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )
    cfg = ChannelConfig(
        channel=channel,
        enabled=config.get("enabled", True),
        scale_v_div=config.get("scale_v_div", 1.0),
        offset_v=config.get("offset_v", 0.0),
        coupling=config.get("coupling", "DC"),
        probe_attenuation=config.get("probe_attenuation", 1.0),
    )

    async def _set():
        driver.set_channel_config(channel, cfg)

    await manager.execute_command(device_id, _set)
    return {"applied": True, "channel": channel}


@router.put(
    "/{device_id}/timebase",
    response_model=dict,
    summary="Set timebase",
    response_description="Confirmation that the timebase configuration was applied.",
)
async def set_timebase(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    session_id: str = Query(..., description="Control session UUID returned by /lock."),
    config: dict = Body(
        ..., description="Timebase configuration payload for the device."
    ),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Apply a timebase configuration to the instrument."""
    manager, driver = await _get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )
    tb = TimebaseConfig(
        scale_s_div=config.get("scale_s_div", 1e-3),
        offset_s=config.get("offset_s", 0.0),
        sample_rate=0.0,  # read-only on hardware; ignored by set_timebase
    )

    async def _set():
        driver.set_timebase(tb)

    await manager.execute_command(device_id, _set)
    return {"applied": True}


@router.put(
    "/{device_id}/trigger",
    response_model=dict,
    summary="Set trigger",
    response_description="Confirmation that the trigger configuration was applied.",
)
async def set_trigger(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    session_id: str = Query(..., description="Control session UUID returned by /lock."),
    config: dict = Body(
        ..., description="Trigger configuration payload for the device."
    ),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Apply a trigger configuration to the instrument."""
    manager, driver = await _get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )
    trig = TriggerConfig(
        source=config.get("source", "CH1"),
        level_v=config.get("level_v", 0.0),
        slope=config.get("slope", "RISE"),
        mode=config.get("mode", "AUTO"),
    )

    async def _set():
        driver.set_trigger(trig)

    await manager.execute_command(device_id, _set)
    return {"applied": True}


@router.get(
    "/{device_id}/screenshot",
    summary="Get screenshot",
    response_description="PNG screenshot captured from the live device display.",
)
async def get_screenshot(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    session_id: str = Query(..., description="Control session UUID returned by /lock."),
    user: UserInfo = Depends(get_current_user),
) -> Response:
    """Capture and return a live screenshot as PNG bytes."""
    manager, driver = await _get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )

    async def _screenshot():
        return driver.get_screenshot()

    png_bytes = await manager.execute_command(device_id, _screenshot, timeout=15.0)
    return Response(content=png_bytes, media_type="image/png")


@router.get(
    "/{device_id}/probe",
    response_model=dict,
    summary="Probe device connectivity",
    response_description="Connectivity diagnostic results for the device.",
)
async def probe_device(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Run a connectivity diagnostic without changing device state."""

    manager, _ = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

    result: dict = {
        "device_id": device_id,
        "ip": entry.config.ip,
        "port": entry.config.port,
        "driver_class": entry.config.driver_class_path,
        "current_state": entry.state.value,
        "tcp_reachable": None,
        "tcp_latency_ms": None,
        "tcp_error": None,
        "driver_connect": None,
        "driver_connect_error": None,
        "identify": None,
        "identify_result": None,
        "identify_error": None,
    }

    # Step 1 — TCP reachability
    t0 = time.monotonic()
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(entry.config.ip, entry.config.port),
            timeout=5.0,
        )
        writer.close()
        await writer.wait_closed()
        result["tcp_reachable"] = True
        result["tcp_latency_ms"] = round((time.monotonic() - t0) * 1000, 1)
    except (OSError, TimeoutError) as exc:
        result["tcp_reachable"] = False
        result["tcp_error"] = str(exc)
        return result

    # Step 2 — Driver connect (temporary driver; does not touch entry.driver)
    try:
        driver_class = _load_driver_class(entry.config.driver_class_path)
        tmp_driver = driver_class(ip=entry.config.ip, port=entry.config.port)
        tmp_driver.connect()
        result["driver_connect"] = True
    except (ImportError, AttributeError, OSError, ValueError, RuntimeError) as exc:
        result["driver_connect"] = False
        result["driver_connect_error"] = str(exc)
        return result

    # Step 3 — *IDN?
    try:
        info = tmp_driver.identify()
        result["identify"] = True
        result["identify_result"] = info.idn
    except (OSError, ValueError, RuntimeError) as exc:
        result["identify"] = False
        result["identify_error"] = str(exc)
    finally:
        try:
            tmp_driver.disconnect()
        except (OSError, RuntimeError):
            pass

    return result
