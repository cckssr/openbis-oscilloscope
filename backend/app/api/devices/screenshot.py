"""Display screenshots: live view (``GET``) and save to the archive (``POST``)."""

import asyncio

from fastapi import Depends, Path, Query, Request
from fastapi.responses import Response

from app.api.devices.common import get_locked_online_driver, make_router
from app.core.dependencies import get_current_user
from app.openbis_client.client import UserInfo

router = make_router()

_DEVICE_ID = Path(..., description="Device identifier.")
_SESSION_ID = Query(..., description="Control session UUID returned by /lock.")


@router.get(
    "/{device_id}/screenshot",
    summary="Get screenshot",
    response_description="PNG screenshot captured from the live device display.",
)
async def get_screenshot(
    request: Request,
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    user: UserInfo = Depends(get_current_user),
) -> Response:
    """Capture and return a live screenshot as PNG bytes (not stored)."""
    manager, driver = await get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )

    async def _screenshot():
        return await asyncio.to_thread(driver.get_screenshot)

    png_bytes = await manager.execute_command(device_id, _screenshot, timeout=15.0)
    return Response(content=png_bytes, media_type="image/png")


@router.post(
    "/{device_id}/screenshot",
    response_model=dict,
    summary="Capture and save screenshot",
    response_description="Artifact ID of the stored screenshot.",
)
async def save_screenshot(
    request: Request,
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Capture a screenshot, save it to the buffer, and return its artifact ID."""
    manager, driver = await get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )
    buffer_service = request.app.state.buffer_service

    async def _screenshot():
        return await asyncio.to_thread(driver.get_screenshot)

    png_bytes = await manager.execute_command(device_id, _screenshot, timeout=15.0)
    art_id = await asyncio.to_thread(
        buffer_service.store_screenshot, device_id, session_id, png_bytes
    )
    return {"artifact_id": art_id}
