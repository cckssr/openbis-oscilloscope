"""Admin API endpoints for managing device locks and states."""

import logging

from fastapi import APIRouter, Depends, Request

from app.core.dependencies import require_admin
from app.core.exceptions import DeviceNotFoundError
from app.openbis_client.client import UserInfo
from app.instruments.manager import DeviceState

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/locks/reset", response_model=dict)
async def reset_all_locks(
    request: Request,
    admin: UserInfo = Depends(require_admin),
) -> dict:
    """Clear all device locks in Redis and reset LOCKED devices to ONLINE.

    This is an admin-only emergency action. All lock keys are deleted from Redis
    regardless of ownership, and every device that was in the ``LOCKED`` state
    is transitioned back to ``ONLINE``. Use when a client has crashed and its
    locks need to be cleared before the TTL expires.

    Args:
        request: The current HTTP request.
        admin: The authenticated admin user, enforced by
            :func:`~app.core.dependencies.require_admin`.

    Returns:
        A dict with ``locks_cleared`` (integer count of deleted Redis keys).

    Raises:
        AdminRequiredError: If the authenticated user is not an admin.
    """
    lock_service = request.app.state.lock_service
    manager = request.app.state.instrument_manager

    count = await lock_service.reset_all_locks()
    logger.warning("Admin %s reset all locks (%d cleared)", admin.user_id, count)

    for device_id, entry in manager.devices.items():
        if entry.state == DeviceState.LOCKED:
            manager.update_state(device_id, DeviceState.ONLINE)

    return {"locks_cleared": count}


@router.post("/devices/{device_id}/force-unlock", response_model=dict)
async def force_unlock(
    device_id: str,
    request: Request,
    admin: UserInfo = Depends(require_admin),
) -> dict:
    """Force-release the lock on a specific device regardless of who holds it.

    Deletes the Redis lock key for ``device_id`` without checking ownership and
    transitions the device to ``ONLINE`` if it was ``LOCKED``. Use to unblock
    a single device when the lock owner is unavailable.

    Args:
        device_id: Path parameter identifying the device to forcibly unlock.
        request: The current HTTP request.
        admin: The authenticated admin user, enforced by
            :func:`~app.core.dependencies.require_admin`.

    Returns:
        A dict with ``device_id`` and ``released`` (``true`` if a lock key was
        deleted, ``false`` if the device was already unlocked).

    Raises:
        DeviceNotFoundError: If ``device_id`` is not registered.
        AdminRequiredError: If the authenticated user is not an admin.
    """
    lock_service = request.app.state.lock_service
    manager = request.app.state.instrument_manager

    try:
        manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e

    released = await lock_service.force_release_lock(device_id)
    logger.warning("Admin %s force-unlocked device %s", admin.user_id, device_id)

    if released:
        manager.update_state(device_id, DeviceState.ONLINE)

    return {"device_id": device_id, "released": released}
