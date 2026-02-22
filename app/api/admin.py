import logging

from fastapi import APIRouter, Depends, Request

from app.core.dependencies import require_admin
from app.core.exceptions import DeviceNotFoundError
from app.openbis_client.client import UserInfo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/locks/reset", response_model=dict)
async def reset_all_locks(
    request: Request,
    admin: UserInfo = Depends(require_admin),
) -> dict:
    """Clear all device locks. Admin only."""
    lock_service = request.app.state.lock_service
    manager = request.app.state.instrument_manager

    count = await lock_service.reset_all_locks()
    logger.warning("Admin %s reset all locks (%d cleared)", admin.user_id, count)

    # Reset all LOCKED devices back to ONLINE
    from app.instruments.manager import DeviceState

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
    """Force-release lock on a specific device. Admin only."""
    lock_service = request.app.state.lock_service
    manager = request.app.state.instrument_manager

    try:
        manager.get_device(device_id)
    except KeyError:
        raise DeviceNotFoundError(device_id)

    released = await lock_service.force_release_lock(device_id)
    logger.warning("Admin %s force-unlocked device %s", admin.user_id, device_id)

    if released:
        from app.instruments.manager import DeviceState

        manager.update_state(device_id, DeviceState.ONLINE)

    return {"device_id": device_id, "released": released}
