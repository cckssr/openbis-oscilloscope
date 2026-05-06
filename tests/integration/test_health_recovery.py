"""
Health monitor recovery test (semi-manual).

This test requires physical interaction: you must unplug and replug a scope
when prompted. Run with --capture=no (-s) to see the prompts.

    pytest tests/integration/test_health_recovery.py --hw -s
"""

import asyncio
import time

import pytest

from app.instruments.health_monitor import HealthMonitor
from app.instruments.manager import DeviceState


@pytest.mark.asyncio
async def test_device_goes_offline_on_disconnect(
    live_client, hw_headers, first_device_id, live_app
):
    """Manually unplug the scope and verify it transitions to OFFLINE within
    HEALTH_CHECK_INTERVAL_SECONDS + a small buffer."""
    from app.config import settings

    manager = live_app.state.instrument_manager
    entry = manager.get_device(first_device_id)
    assert entry.state == DeviceState.ONLINE

    print(
        f"\n[MANUAL] Please UNPLUG the network cable of {first_device_id} "
        f"({entry.config.ip}) now.\nPress Enter when done..."
    )
    input()

    wait_seconds = settings.HEALTH_CHECK_INTERVAL_SECONDS + 10
    print(f"Waiting up to {wait_seconds}s for offline detection...")

    # Start a minimal health monitor pointed at the test app
    monitor = HealthMonitor(manager)
    monitor_task = asyncio.create_task(monitor.start())

    deadline = time.monotonic() + wait_seconds
    while time.monotonic() < deadline:
        await asyncio.sleep(1)
        if entry.state == DeviceState.OFFLINE:
            break

    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass

    assert entry.state == DeviceState.OFFLINE, (
        f"Expected {first_device_id} to go OFFLINE after unplugging, "
        f"still in state: {entry.state}"
    )

    print(
        f"\n[MANUAL] Please RECONNECT {first_device_id} ({entry.config.ip}) now.\n"
        "Press Enter when done..."
    )
    input()

    # Restart monitor and wait for recovery
    manager2 = live_app.state.instrument_manager
    monitor2 = HealthMonitor(manager2)
    monitor_task2 = asyncio.create_task(monitor2.start())

    recovery_deadline = time.monotonic() + wait_seconds
    while time.monotonic() < recovery_deadline:
        await asyncio.sleep(1)
        if entry.state == DeviceState.ONLINE:
            break

    monitor_task2.cancel()
    try:
        await monitor_task2
    except asyncio.CancelledError:
        pass

    assert entry.state == DeviceState.ONLINE, (
        f"Expected {first_device_id} to recover to ONLINE after replug, "
        f"still in state: {entry.state}"
    )


@pytest.mark.asyncio
async def test_probe_reflects_connectivity(live_client, hw_headers, first_device_id):
    """GET /devices/{id}/probe returns tcp_reachable=True for a connected device."""
    resp = await live_client.get(
        f"/devices/{first_device_id}/probe", headers=hw_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["tcp_reachable"] is True, f"Probe reports device unreachable: {data}"
    latency = data.get("latency_ms")
    assert latency is not None and latency > 0, "Probe returned no latency"
