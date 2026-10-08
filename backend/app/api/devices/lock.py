"""``/devices/{id}/lock``, ``/unlock`` and ``/heartbeat``: exclusive device control."""

import uuid

from fastapi import Depends, Path, Query, Request

from app.api.devices.common import (
    get_entry,
    get_services,
    make_router,
    publish_lock_event,
)
from app.core.dependencies import get_current_user
from app.core.exceptions import (
    DeviceOfflineError,
    LockConflictError,
    LockRequiredError,
)
from app.instruments.manager import DeviceState
from app.openbis_client.client import UserInfo

router = make_router()


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
    commands and refreshed periodically with ``/heartbeat``. The session is
    registered in the buffer with the caller as owner, which is what restricts
    ``/sessions/{id}/...`` to that user (and admins).
    """
    manager, lock_service = get_services(request)
    entry = get_entry(manager, device_id)

    if entry.state == DeviceState.OFFLINE:
        raise DeviceOfflineError(device_id)

    session_id = str(uuid.uuid4())
    acquired = await lock_service.acquire_lock(device_id, user.user_id, session_id)
    if not acquired:
        lock = await lock_service.get_lock(device_id)
        owner = lock.owner_user if lock else "unknown"
        raise LockConflictError(device_id, owner)

    request.app.state.buffer_service.register_session(
        device_id, session_id, user.user_id
    )
    manager.update_state(device_id, DeviceState.LOCKED)
    publish_lock_event(request, device_id, user.user_id, session_id)
    return {"control_session_id": session_id, "device_id": device_id}


@router.post(
    "/{device_id}/unlock",
    response_model=dict,
    summary="Release device lock",
    response_description="Confirmation that the lock was released (or softened).",
)
async def release_lock(
    request: Request,
    device_id: str = Path(..., description="Device identifier."),
    session_id: str = Query(..., description="Control session UUID returned by /lock."),
    soft: bool = Query(
        default=False,
        description="Soft release for page unload: keep the lock but shorten its "
        "TTL to LOCK_SOFT_RELEASE_SECONDS so the same user can reclaim it.",
    ),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Release the caller's exclusive lock on a device.

    With ``soft=true`` the lock is *not* deleted: its TTL is shortened to
    ``LOCK_SOFT_RELEASE_SECONDS``, the device stays ``LOCKED`` and the same user
    can reclaim it through ``GET /devices/{id}`` (``lock.is_mine`` +
    ``session_id``). The next heartbeat restores the full TTL; if nobody
    reclaims it the lock expires and the device returns to ``ONLINE``.

    Returns:
        ``{"released": true}`` for a normal release, or
        ``{"released": false, "soft": true, "expires_in": <seconds>}``.

    Raises:
        LockRequiredError: If the session does not hold the lock.
    """
    manager, lock_service = get_services(request)
    get_entry(manager, device_id)

    if soft:
        expires_in = await lock_service.soften_lock(device_id, session_id)
        if expires_in is None:
            raise LockRequiredError(device_id)
        return {"released": False, "soft": True, "expires_in": expires_in}

    released = await lock_service.release_lock(device_id, session_id)
    if not released:
        raise LockRequiredError(device_id)

    manager.update_state(device_id, DeviceState.ONLINE)
    publish_lock_event(request, device_id, None, None)
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
    """Renew the TTL on an existing device lock (also ends a soft release)."""
    _, lock_service = get_services(request)
    renewed = await lock_service.renew_lock(device_id, session_id)
    if not renewed:
        raise LockRequiredError(device_id)
    return {"renewed": True}
