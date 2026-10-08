"""Run-control commands: ``run``, ``stop`` and the optional ``single`` / ``force-trigger`` / ``autoscale``."""

import asyncio

from fastapi import Depends, Path, Query, Request

from app.api.devices.common import get_locked_online_driver, make_router
from app.core.dependencies import get_current_user
from app.core.exceptions import NotSupportedError
from app.openbis_client.client import UserInfo

router = make_router()

_DEVICE_ID = Path(..., description="Device identifier.")
_SESSION_ID = Query(..., description="Control session UUID returned by /lock.")


@router.post(
    "/{device_id}/run",
    response_model=dict,
    summary="Start acquisition",
    response_description="Confirmation that continuous acquisition is running.",
)
async def run_device(
    request: Request,
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Start continuous acquisition on the device."""
    manager, driver = await get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )

    async def _run():
        await asyncio.to_thread(driver.run)

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
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Stop acquisition on the device."""
    manager, driver = await get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )

    async def _stop():
        await asyncio.to_thread(driver.stop)

    await manager.execute_command(device_id, _stop)
    return {"status": "stopped"}


async def _optional_command(
    request: Request,
    device_id: str,
    session_id: str,
    user: UserInfo,
    command: str,
    capability: str,
    method: str,
    timeout: float = 30.0,
) -> dict:
    """Run an optional driver command through the device queue.

    Args:
        request: The current HTTP request.
        device_id: Device identifier from the URL.
        session_id: Control session UUID supplied by the caller.
        user: The authenticated user.
        command: URL command name, echoed back as ``status``.
        capability: Capability the driver must advertise.
        method: Name of the driver method to call.
        timeout: Maximum seconds to wait for the command.

    Returns:
        ``{"status": command}``.

    Raises:
        LockRequiredError: If the caller does not hold the lock.
        NotSupportedError: If the driver does not advertise ``capability``.
    """
    manager, driver = await get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )
    if capability not in driver.capabilities:
        raise NotSupportedError(device_id, capability)

    async def _command():
        await asyncio.to_thread(getattr(driver, method))

    await manager.execute_command(device_id, _command, timeout=timeout)
    return {"status": command}


@router.post(
    "/{device_id}/single",
    response_model=dict,
    summary="Arm single acquisition",
    response_description="Confirmation that a single acquisition was armed.",
)
async def single_device(
    request: Request,
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Arm a single acquisition (capability ``single``; 400 ``not_supported`` otherwise)."""
    return await _optional_command(
        request, device_id, session_id, user, "single", "single", "single"
    )


@router.post(
    "/{device_id}/force-trigger",
    response_model=dict,
    summary="Force trigger",
    response_description="Confirmation that a trigger was forced.",
)
async def force_trigger_device(
    request: Request,
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Force a trigger now (capability ``force_trigger``; 400 ``not_supported`` otherwise)."""
    return await _optional_command(
        request,
        device_id,
        session_id,
        user,
        "force-trigger",
        "force_trigger",
        "force_trigger",
    )


@router.post(
    "/{device_id}/autoscale",
    response_model=dict,
    summary="Auto-Setup",
    response_description="Confirmation that the scope finished its Auto-Setup.",
)
async def autoscale_device(
    request: Request,
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Run the scope's Auto-Setup (capability ``autoscale``; 400 ``not_supported`` otherwise).

    The call returns after the scope has settled, so the next ``GET /settings``
    shows the new scales.
    """
    return await _optional_command(
        request,
        device_id,
        session_id,
        user,
        "autoscale",
        "autoscale",
        "autoscale",
        timeout=45.0,
    )
