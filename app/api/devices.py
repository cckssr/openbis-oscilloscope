import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from app.core.dependencies import get_current_user
from app.core.exceptions import DeviceNotFoundError, DeviceOfflineError, LockConflictError, LockRequiredError
from app.instruments.manager import DeviceState, InstrumentManager
from app.locks.service import LockService
from app.openbis_client.client import UserInfo

router = APIRouter(prefix="/devices", tags=["devices"])


def _get_services(request: Request) -> tuple[InstrumentManager, LockService]:
    return request.app.state.instrument_manager, request.app.state.lock_service


# ---------------------------------------------------------------------------
# Device listing
# ---------------------------------------------------------------------------

@router.get("", response_model=list[dict])
async def list_devices(
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    manager, lock_service = _get_services(request)
    result = []
    for ds in manager.get_device_list():
        lock = await lock_service.get_lock(ds.id)
        lock_info = None
        if lock:
            lock_info = {
                "owner_user": lock.owner_user,
                "acquired_at": lock.acquired_at,
                # Mask session_id unless it's the caller's own lock
                "is_mine": lock.owner_user == user.user_id,
            }
        result.append({
            "id": ds.id,
            "label": ds.label,
            "ip": ds.ip,
            "port": ds.port,
            "state": ds.state.value,
            "last_error": ds.last_error,
            "lock": lock_info,
        })
    return result


@router.get("/{device_id}", response_model=dict)
async def get_device(
    device_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    manager, lock_service = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError:
        raise DeviceNotFoundError(device_id)

    lock = await lock_service.get_lock(device_id)
    lock_info = None
    if lock:
        lock_info = {
            "owner_user": lock.owner_user,
            "acquired_at": lock.acquired_at,
            "is_mine": lock.owner_user == user.user_id,
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

@router.post("/{device_id}/lock", response_model=dict)
async def acquire_lock(
    device_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    manager, lock_service = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError:
        raise DeviceNotFoundError(device_id)

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


@router.post("/{device_id}/unlock", response_model=dict)
async def release_lock(
    device_id: str,
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    manager, lock_service = _get_services(request)
    try:
        manager.get_device(device_id)
    except KeyError:
        raise DeviceNotFoundError(device_id)

    released = await lock_service.release_lock(device_id, session_id)
    if not released:
        raise LockRequiredError(device_id)

    manager.update_state(device_id, DeviceState.ONLINE)
    return {"released": True}


@router.post("/{device_id}/heartbeat", response_model=dict)
async def heartbeat(
    device_id: str,
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    _, lock_service = _get_services(request)
    renewed = await lock_service.renew_lock(device_id, session_id)
    if not renewed:
        raise LockRequiredError(device_id)
    return {"renewed": True}


# ---------------------------------------------------------------------------
# Instrument commands (require lock)
# ---------------------------------------------------------------------------

def _verify_lock_ownership(lock, user_id: str, session_id: str, device_id: str) -> None:
    if lock is None or lock.session_id != session_id or lock.owner_user != user_id:
        raise LockRequiredError(device_id)


@router.post("/{device_id}/run", response_model=dict)
async def run_device(
    device_id: str,
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    manager, lock_service = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError:
        raise DeviceNotFoundError(device_id)

    lock = await lock_service.get_lock(device_id)
    _verify_lock_ownership(lock, user.user_id, session_id, device_id)

    if entry.driver is None:
        raise DeviceOfflineError(device_id)

    driver = entry.driver

    async def _run():
        driver.run()

    await manager.execute_command(device_id, _run)
    return {"status": "running"}


@router.post("/{device_id}/stop", response_model=dict)
async def stop_device(
    device_id: str,
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    manager, lock_service = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError:
        raise DeviceNotFoundError(device_id)

    lock = await lock_service.get_lock(device_id)
    _verify_lock_ownership(lock, user.user_id, session_id, device_id)

    if entry.driver is None:
        raise DeviceOfflineError(device_id)

    driver = entry.driver

    async def _stop():
        driver.stop()

    await manager.execute_command(device_id, _stop)
    return {"status": "stopped"}


@router.post("/{device_id}/acquire", response_model=dict)
async def acquire(
    device_id: str,
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    manager, lock_service = _get_services(request)
    buffer_service = request.app.state.buffer_service

    try:
        entry = manager.get_device(device_id)
    except KeyError:
        raise DeviceNotFoundError(device_id)

    lock = await lock_service.get_lock(device_id)
    _verify_lock_ownership(lock, user.user_id, session_id, device_id)

    if entry.driver is None:
        raise DeviceOfflineError(device_id)

    driver = entry.driver

    async def _acquire():
        meta = driver.get_all_settings()
        artifact_ids = []

        # Acquire all enabled channels
        for ch in range(1, 5):
            try:
                cfg = driver.get_channel_config(ch)
                if not cfg.enabled:
                    continue
            except Exception:
                continue

            waveform = driver.acquire_waveform(ch)
            art_id = buffer_service.store_waveform(device_id, session_id, waveform, meta)
            artifact_ids.append(art_id)

        # Also capture screenshot
        try:
            png_bytes = driver.get_screenshot()
            shot_id = buffer_service.store_screenshot(device_id, session_id, png_bytes)
            artifact_ids.append(shot_id)
        except Exception:
            pass

        return artifact_ids

    artifact_ids = await manager.execute_command(device_id, _acquire, timeout=60.0)
    return {"artifact_ids": artifact_ids, "session_id": session_id}


@router.get("/{device_id}/channels/{channel}/data", response_model=dict)
async def get_channel_data(
    device_id: str,
    channel: int,
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    manager, lock_service = _get_services(request)
    buffer_service = request.app.state.buffer_service

    try:
        manager.get_device(device_id)
    except KeyError:
        raise DeviceNotFoundError(device_id)

    lock = await lock_service.get_lock(device_id)
    _verify_lock_ownership(lock, user.user_id, session_id, device_id)

    # Find most recent trace artifact for this channel
    artifacts = buffer_service.list_artifacts(session_id)
    matching = [
        a for a in artifacts
        if a.artifact_type == "trace" and a.channel == channel
    ]
    if not matching:
        from app.core.exceptions import ArtifactNotFoundError
        raise ArtifactNotFoundError(f"No data for channel {channel}")

    latest = max(matching, key=lambda a: a.seq)
    paths = buffer_service.get_artifact_paths(session_id, latest.artifact_id)
    csv_path = next((p for p in paths if p.suffix == ".csv"), None)
    if csv_path is None:
        from app.core.exceptions import ArtifactNotFoundError
        raise ArtifactNotFoundError(latest.artifact_id)

    # Parse CSV and return as JSON
    times, volts = [], []
    with csv_path.open() as f:
        for line in f:
            if line.startswith("#"):
                continue
            parts = line.strip().split(",")
            if len(parts) == 2:
                try:
                    times.append(float(parts[0]))
                    volts.append(float(parts[1]))
                except ValueError:
                    pass

    return {
        "artifact_id": latest.artifact_id,
        "channel": channel,
        "time_s": times,
        "voltage_V": volts,
    }


@router.get("/{device_id}/screenshot")
async def get_screenshot(
    device_id: str,
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> Response:
    manager, lock_service = _get_services(request)

    try:
        entry = manager.get_device(device_id)
    except KeyError:
        raise DeviceNotFoundError(device_id)

    lock = await lock_service.get_lock(device_id)
    _verify_lock_ownership(lock, user.user_id, session_id, device_id)

    if entry.driver is None:
        raise DeviceOfflineError(device_id)

    driver = entry.driver

    async def _screenshot():
        return driver.get_screenshot()

    png_bytes = await manager.execute_command(device_id, _screenshot, timeout=15.0)
    return Response(content=png_bytes, media_type="image/png")
