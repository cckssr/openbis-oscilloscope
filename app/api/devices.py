"""API endpoints for device listing, lock management, and instrument commands."""

import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from app.core.dependencies import get_current_user
from app.core.exceptions import (
    DeviceNotFoundError,
    DeviceOfflineError,
    LockConflictError,
    LockRequiredError,
    ArtifactNotFoundError,
)
from app.instruments.manager import DeviceState, InstrumentManager
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


@router.get("", response_model=list[dict])
async def list_devices(
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    """Return a summary of all registered devices including their current lock state.

    The ``lock.is_mine`` field in each lock object indicates whether the
    authenticated user is the current lock holder. The ``session_id`` is not
    exposed here to prevent other users from impersonating a session.

    Args:
        request: The current HTTP request.
        user: The authenticated user, injected by :func:`~app.core.dependencies.get_current_user`.

    Returns:
        A list of dicts, each containing ``id``, ``label``, ``ip``, ``port``,
        ``state``, ``last_error``, and ``lock`` (or ``null`` if unlocked).
    """
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


@router.get("/{device_id}", response_model=dict)
async def get_device(
    device_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Return detailed information for a single device including its capabilities.

    ``capabilities`` is a list of supported command names (``["run", "stop",
    "acquire", "screenshot"]``) when a driver is connected, or empty when the
    device is offline.

    Args:
        device_id: Path parameter identifying the target device.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A dict with ``id``, ``label``, ``ip``, ``port``, ``state``,
        ``last_error``, ``lock``, and ``capabilities``.

    Raises:
        DeviceNotFoundError: If ``device_id`` is not registered.
    """
    manager, lock_service = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

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
    """Acquire an exclusive control lock on a device.

    Generates a UUID ``control_session_id`` and stores it in Redis with a TTL
    of :attr:`~app.config.Settings.LOCK_TTL_SECONDS`. The caller must supply
    this ID in all subsequent command requests and must call ``/heartbeat``
    periodically to prevent expiry.

    Args:
        device_id: Path parameter identifying the device to lock.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A dict with ``control_session_id`` (UUID string) and ``device_id``.

    Raises:
        DeviceNotFoundError: If ``device_id`` is not registered.
        DeviceOfflineError: If the device is currently ``OFFLINE``.
        LockConflictError: If the device is already locked by another user.
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


@router.post("/{device_id}/unlock", response_model=dict)
async def release_lock(
    device_id: str,
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Release the caller's exclusive lock on a device.

    Args:
        device_id: Path parameter identifying the device to unlock.
        session_id: Query parameter; the UUID returned when the lock was acquired.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A dict with ``released: true``.

    Raises:
        DeviceNotFoundError: If ``device_id`` is not registered.
        LockRequiredError: If the session ID does not match the current lock
            (i.e. the caller does not own the lock).
    """
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


@router.post("/{device_id}/heartbeat", response_model=dict)
async def heartbeat(
    device_id: str,
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Reset the TTL on an existing device lock.

    Should be called every few minutes by the lock holder to prevent automatic
    expiry. The lock TTL is reset to :attr:`~app.config.Settings.LOCK_TTL_SECONDS`
    on each successful call.

    Args:
        device_id: Path parameter identifying the locked device.
        session_id: Query parameter; the UUID returned when the lock was acquired.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A dict with ``renewed: true``.

    Raises:
        LockRequiredError: If the session ID does not match the current lock.
    """
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


@router.post("/{device_id}/run", response_model=dict)
async def run_device(
    device_id: str,
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Start continuous acquisition on the device.

    Args:
        device_id: Path parameter identifying the target device.
        session_id: Query parameter; the UUID returned when the lock was acquired.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A dict with ``status: "running"``.

    Raises:
        DeviceNotFoundError: If ``device_id`` is not registered.
        LockRequiredError: If the caller does not hold the lock.
        DeviceOfflineError: If the device driver is not connected.
    """
    manager, lock_service = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

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
    """Stop acquisition on the device.

    Args:
        device_id: Path parameter identifying the target device.
        session_id: Query parameter; the UUID returned when the lock was acquired.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A dict with ``status: "stopped"``.

    Raises:
        DeviceNotFoundError: If ``device_id`` is not registered.
        LockRequiredError: If the caller does not hold the lock.
        DeviceOfflineError: If the device driver is not connected.
    """
    manager, lock_service = _get_services(request)
    try:
        entry = manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

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
    """Acquire waveforms from all enabled channels and capture a screenshot.

    For each enabled channel (1–4) a waveform is transferred and stored as a
    CSV + JSON metadata pair via :class:`~app.buffer.service.BufferService`.
    A screenshot is also captured and stored. All resulting artifact IDs are
    returned. Channels that fail or are disabled are silently skipped.

    Args:
        device_id: Path parameter identifying the target device.
        session_id: Query parameter; the UUID returned when the lock was acquired.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A dict with ``artifact_ids`` (list of stored artifact ID strings) and
        ``session_id``.

    Raises:
        DeviceNotFoundError: If ``device_id`` is not registered.
        LockRequiredError: If the caller does not hold the lock.
        DeviceOfflineError: If the device driver is not connected.
    """
    manager, lock_service = _get_services(request)
    buffer_service = request.app.state.buffer_service

    try:
        entry = manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

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
            art_id = buffer_service.store_waveform(
                device_id, session_id, waveform, meta
            )
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
    """Return the most recent waveform for a channel as JSON time/voltage arrays.

    Finds the highest-sequence trace artifact for the requested channel in the
    session buffer, parses the CSV file, and returns the data.

    Args:
        device_id: Path parameter identifying the device.
        channel: Path parameter for the 1-based channel number.
        session_id: Query parameter; the UUID returned when the lock was acquired.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A dict with ``artifact_id``, ``channel``, ``time_s`` (list of floats),
        and ``voltage_V`` (list of floats).

    Raises:
        DeviceNotFoundError: If ``device_id`` is not registered.
        LockRequiredError: If the caller does not hold the lock.
        ArtifactNotFoundError: If no trace has been acquired for this channel yet.
    """
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


@router.get("/{device_id}/screenshot")
async def get_screenshot(
    device_id: str,
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> Response:
    """Capture and return a live screenshot from the device display as a PNG image.

    The screenshot is taken in real time via the driver (not read from the
    buffer). The response content-type is ``image/png``.

    Args:
        device_id: Path parameter identifying the target device.
        session_id: Query parameter; the UUID returned when the lock was acquired.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A :class:`~fastapi.responses.Response` containing raw PNG bytes with
        ``content_type="image/png"``.

    Raises:
        DeviceNotFoundError: If ``device_id`` is not registered.
        LockRequiredError: If the caller does not hold the lock.
        DeviceOfflineError: If the device driver is not connected.
    """
    manager, lock_service = _get_services(request)

    try:
        entry = manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

    lock = await lock_service.get_lock(device_id)
    _verify_lock_ownership(lock, user.user_id, session_id, device_id)

    if entry.driver is None:
        raise DeviceOfflineError(device_id)

    driver = entry.driver

    async def _screenshot():
        return driver.get_screenshot()

    png_bytes = await manager.execute_command(device_id, _screenshot, timeout=15.0)
    return Response(content=png_bytes, media_type="image/png")
