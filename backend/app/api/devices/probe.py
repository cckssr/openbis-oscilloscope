"""``GET /devices/{id}/probe``: step-by-step connectivity diagnostic."""

import asyncio
import time

from fastapi import Depends, Path, Request

from app.api.devices.common import get_entry, get_services, make_router
from app.core.dependencies import get_current_user
from app.instruments.manager import _load_driver_class
from app.openbis_client.client import UserInfo

router = make_router()


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

    manager, _ = get_services(request)
    entry = get_entry(manager, device_id)

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
