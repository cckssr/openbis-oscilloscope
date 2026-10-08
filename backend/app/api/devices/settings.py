"""Instrument settings: snapshot, memory depth and channel / timebase / trigger setters."""

import asyncio

from fastapi import Body, Depends, Path, Query, Request

from app.api.devices.common import (
    get_entry,
    get_locked_online_driver,
    get_services,
    make_router,
)
from app.core.dependencies import get_current_user
from app.core.exceptions import DeviceOfflineError, ValidationError
from app.instruments.base_driver import ChannelConfig, TimebaseConfig, TriggerConfig
from app.openbis_client.client import UserInfo

router = make_router()

_DEVICE_ID = Path(..., description="Device identifier.")
_SESSION_ID = Query(..., description="Control session UUID returned by /lock.")


@router.get(
    "/{device_id}/settings",
    response_model=dict,
    summary="Get device settings",
    response_description="Current channel, timebase, and trigger settings.",
)
async def get_settings(
    request: Request,
    device_id: str = _DEVICE_ID,
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Return the current instrument settings as a single snapshot.

    ``channels`` is keyed by channel number for ``1..channel_count``; channels
    that cannot be read are omitted.
    """
    manager, _ = get_services(request)
    entry = get_entry(manager, device_id)
    if entry.driver is None:
        raise DeviceOfflineError(device_id)
    driver = entry.driver

    async def _get():
        def _sync_get() -> dict:
            channels = {}
            for ch in range(1, driver.channel_count + 1):
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

        return await asyncio.to_thread(_sync_get)

    return await manager.execute_command(device_id, _get)


@router.get(
    "/{device_id}/memory-depth",
    response_model=dict,
    summary="Get memory depth",
    response_description="Current acquisition memory depth in samples.",
)
async def get_memory_depth(
    request: Request,
    device_id: str = _DEVICE_ID,
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Return the current acquisition memory depth for the device."""
    manager, _ = get_services(request)
    entry = get_entry(manager, device_id)
    if entry.driver is None:
        raise DeviceOfflineError(device_id)
    driver = entry.driver

    async def _get():
        return await asyncio.to_thread(driver.get_memory_depth)

    depth = await manager.execute_command(device_id, _get)
    return {"device_id": device_id, "memory_depth": depth}


@router.put(
    "/{device_id}/channels/{channel}/config",
    response_model=dict,
    summary="Set channel config",
    response_description="Confirmation that the channel configuration was applied.",
)
async def set_channel_config(
    request: Request,
    device_id: str = _DEVICE_ID,
    channel: int = Path(..., description="1-based channel number."),
    session_id: str = _SESSION_ID,
    config: dict = Body(
        ..., description="Channel configuration payload for the selected channel."
    ),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Apply a channel configuration to the instrument.

    Raises:
        ValidationError: If the channel is out of range or the scale is not positive.
    """
    manager, driver = await get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )
    if not 1 <= channel <= driver.channel_count:
        raise ValidationError(
            f"Invalid channel {channel}; this device has channels 1-{driver.channel_count}"
        )
    cfg = ChannelConfig(
        channel=channel,
        enabled=config.get("enabled", True),
        scale_v_div=config.get("scale_v_div", 1.0),
        offset_v=config.get("offset_v", 0.0),
        coupling=config.get("coupling", "DC"),
        probe_attenuation=config.get("probe_attenuation", 1.0),
    )
    if cfg.scale_v_div <= 0:
        raise ValidationError("scale_v_div must be positive")

    async def _set():
        await asyncio.to_thread(driver.set_channel_config, channel, cfg)

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
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    config: dict = Body(
        ..., description="Timebase configuration payload for the device."
    ),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Apply a timebase configuration to the instrument.

    Raises:
        ValidationError: If ``scale_s_div`` is not positive.
    """
    manager, driver = await get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )
    tb = TimebaseConfig(
        scale_s_div=config.get("scale_s_div", 1e-3),
        offset_s=config.get("offset_s", 0.0),
        sample_rate=0.0,  # read-only on hardware; ignored by set_timebase
    )
    if tb.scale_s_div <= 0:
        raise ValidationError("scale_s_div must be positive")

    async def _set():
        await asyncio.to_thread(driver.set_timebase, tb)

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
    device_id: str = _DEVICE_ID,
    session_id: str = _SESSION_ID,
    config: dict = Body(
        ..., description="Trigger configuration payload for the device."
    ),
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Apply a trigger configuration to the instrument."""
    manager, driver = await get_locked_online_driver(
        request, device_id, user.user_id, session_id
    )
    trig = TriggerConfig(
        source=config.get("source", "CH1"),
        level_v=config.get("level_v", 0.0),
        slope=config.get("slope", "RISE"),
        mode=config.get("mode", "AUTO"),
    )

    async def _set():
        await asyncio.to_thread(driver.set_trigger, trig)

    await manager.execute_command(device_id, _set)
    return {"applied": True}
