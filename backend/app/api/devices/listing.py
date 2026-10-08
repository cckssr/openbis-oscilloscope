"""``GET /devices`` and ``GET /devices/{id}``: device listing and details."""

from datetime import datetime, timezone

from fastapi import Depends, Path, Request

from app.api.devices.common import (
    get_entry,
    get_services,
    lock_info_dict,
    make_router,
    reconcile_expired_lock,
)
from app.core.dependencies import get_current_user
from app.instruments.base_driver import BaseOscilloscopeDriver
from app.openbis_client.client import UserInfo

router = make_router()


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
    owner. A device whose lock expired in Redis is reported (and reset to)
    ``ONLINE``.
    """
    manager, lock_service = get_services(request)
    result = []
    for ds in manager.get_device_list():
        lock = await lock_service.get_lock(ds.id)
        state = reconcile_expired_lock(request, manager, ds.id, ds.state, lock)
        result.append(
            {
                "id": ds.id,
                "label": ds.label,
                "ip": ds.ip,
                "port": ds.port,
                "state": state.value,
                "last_error": ds.last_error,
                "lock": lock_info_dict(lock, user.user_id),
                "online_since_utc": ds.online_since_utc,
                "uptime_minutes": ds.uptime_minutes,
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

    ``capabilities`` is derived from the connected driver (see
    :attr:`~app.instruments.base_driver.BaseOscilloscopeDriver.capabilities`) and
    is empty when the device is offline. ``channel_count`` is the number of
    analog input channels of the driver (4 when no driver is connected).
    """
    manager, lock_service = get_services(request)
    entry = get_entry(manager, device_id)

    lock = await lock_service.get_lock(device_id)
    state = reconcile_expired_lock(request, manager, device_id, entry.state, lock)

    driver = entry.driver
    capabilities = driver.capabilities if driver is not None else []
    channel_count = (
        driver.channel_count
        if driver is not None
        else BaseOscilloscopeDriver.channel_count
    )

    now = datetime.now(timezone.utc)
    uptime_minutes = (
        (now - entry.online_since).total_seconds() / 60 if entry.online_since else None
    )

    return {
        "id": entry.config.id,
        "label": entry.config.label,
        "ip": entry.config.ip,
        "port": entry.config.port,
        "state": state.value,
        "last_error": entry.last_error,
        "lock": lock_info_dict(lock, user.user_id),
        "capabilities": capabilities,
        "channel_count": channel_count,
        "online_since_utc": (
            entry.online_since.isoformat() if entry.online_since else None
        ),
        "uptime_minutes": uptime_minutes,
    }
