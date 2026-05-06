"""
Lock lifecycle: TTL expiry, wrong-owner rejection, admin force-unlock,
end-of-session cleanup, and heartbeat-based renewal.
"""

import asyncio

import pytest


@pytest.mark.asyncio
async def test_wrong_session_id_rejected(live_client, hw_headers, locked_device):
    """A command with a mismatched session_id must be rejected with 403."""
    device_id, _correct_sid = locked_device
    wrong_sid = "00000000-0000-0000-0000-000000000000"

    resp = await live_client.post(
        f"/devices/{device_id}/acquire",
        params={"session_id": wrong_sid},
        headers=hw_headers,
        json={"max_samples": False},
        timeout=30.0,
    )
    assert resp.status_code in (
        403,
        423,
    ), f"Expected 403/423 for wrong session_id, got {resp.status_code}"


@pytest.mark.asyncio
async def test_unlock_with_wrong_session_rejected(
    live_client, hw_headers, locked_device
):
    """Unlock with a mismatched session_id must fail."""
    device_id, _correct_sid = locked_device
    wrong_sid = "00000000-0000-0000-0000-000000000000"

    resp = await live_client.post(
        f"/devices/{device_id}/unlock",
        params={"session_id": wrong_sid},
        headers=hw_headers,
    )
    assert resp.status_code in (403, 423)


@pytest.mark.asyncio
async def test_admin_force_unlock_releases_any_lock(
    live_client, hw_headers, locked_device
):
    """Admin force-unlock succeeds even when the caller doesn't own the lock."""
    device_id, _sid = locked_device

    resp = await live_client.post(
        f"/admin/devices/{device_id}/force-unlock", headers=hw_headers
    )
    assert resp.status_code == 200
    assert resp.json()["released"] is True

    # Device should now be lockable again
    resp2 = await live_client.post(f"/devices/{device_id}/lock", headers=hw_headers)
    assert resp2.status_code == 200
    new_sid = resp2.json()["control_session_id"]
    await live_client.post(
        f"/devices/{device_id}/unlock",
        params={"session_id": new_sid},
        headers=hw_headers,
    )


@pytest.mark.asyncio
async def test_admin_reset_all_locks(live_client, hw_headers, device_ids):
    """POST /admin/locks/reset clears every lock regardless of ownership."""
    # Lock all devices first
    sessions = {}
    for dev_id in device_ids:
        resp = await live_client.post(f"/devices/{dev_id}/lock", headers=hw_headers)
        assert resp.status_code == 200
        sessions[dev_id] = resp.json()["control_session_id"]

    # Reset all
    resp = await live_client.post("/admin/locks/reset", headers=hw_headers)
    assert resp.status_code == 200
    assert resp.json()["locks_cleared"] >= len(device_ids)

    # All devices should be lockable again (no orphaned lock)
    for dev_id in device_ids:
        resp = await live_client.post(f"/devices/{dev_id}/lock", headers=hw_headers)
        assert (
            resp.status_code == 200
        ), f"Could not re-lock {dev_id} after reset: {resp.text}"
        sid = resp.json()["control_session_id"]
        await live_client.post(
            f"/devices/{dev_id}/unlock",
            params={"session_id": sid},
            headers=hw_headers,
        )


@pytest.mark.asyncio
async def test_heartbeat_keeps_lock_alive(live_client, hw_headers, locked_device):
    """Repeated heartbeats keep the lock valid and return 200."""
    device_id, session_id = locked_device

    for _ in range(3):
        resp = await live_client.post(
            f"/devices/{device_id}/heartbeat",
            params={"session_id": session_id},
            headers=hw_headers,
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.1)


@pytest.mark.asyncio
async def test_second_lock_attempt_while_locked(live_client, hw_headers, locked_device):
    """A second user trying to lock an already-locked device gets 409 or 423."""
    device_id, _sid = locked_device
    resp = await live_client.post(f"/devices/{device_id}/lock", headers=hw_headers)
    assert resp.status_code in (
        409,
        423,
    ), f"Expected conflict, got {resp.status_code}: {resp.text}"


@pytest.mark.asyncio
async def test_lock_released_device_is_lockable(
    live_client, hw_headers, first_device_id
):
    """After unlock, a new client can immediately acquire the same device."""
    resp = await live_client.post(
        f"/devices/{first_device_id}/lock", headers=hw_headers
    )
    assert resp.status_code == 200
    session_id = resp.json()["control_session_id"]

    await live_client.post(
        f"/devices/{first_device_id}/unlock",
        params={"session_id": session_id},
        headers=hw_headers,
    )

    resp2 = await live_client.post(
        f"/devices/{first_device_id}/lock", headers=hw_headers
    )
    assert resp2.status_code == 200
    session_id2 = resp2.json()["control_session_id"]

    assert session_id != session_id2  # new session each time

    await live_client.post(
        f"/devices/{first_device_id}/unlock",
        params={"session_id": session_id2},
        headers=hw_headers,
    )
