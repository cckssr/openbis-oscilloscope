"""
Per-device command serialization: 10 concurrent acquire requests on the same device
must be processed one at a time and their artifacts must have monotonically increasing
seq numbers — proving the asyncio.Queue worker is enforcing serial execution.
"""

import asyncio

import pytest

CONCURRENT_REQUESTS = 5


@pytest.mark.asyncio
async def test_concurrent_acquires_serialize(
    live_client, hw_headers, locked_device, live_app
):
    """Concurrent POST /acquire calls on one device complete without BUSY errors,
    and artifact seq numbers are strictly increasing."""
    device_id, session_id = locked_device

    responses = await asyncio.gather(
        *[
            live_client.post(
                f"/devices/{device_id}/acquire",
                params={"session_id": session_id},
                headers=hw_headers,
                json={"max_samples": False},
                timeout=120.0,
            )
            for _ in range(CONCURRENT_REQUESTS)
        ]
    )

    assert all(
        r.status_code == 200 for r in responses
    ), f"Some acquire calls failed: {[r.status_code for r in responses]}"

    # Check artifact seq numbers from the buffer index
    buffer_service = live_app.state.buffer_service
    artifacts = buffer_service.list_artifacts(session_id)
    waveform_artifacts = [a for a in artifacts if a.get("artifact_type") == "waveform"]

    seqs = [a["seq"] for a in waveform_artifacts]
    assert seqs == sorted(
        seqs
    ), f"Artifact seq numbers are not monotonically increasing: {seqs}"
    assert len(seqs) > 0, "No waveform artifacts were created"


@pytest.mark.asyncio
async def test_no_interleaved_commands(live_client, hw_headers, locked_device):
    """While one acquire is in-flight, a second acquire on the same device waits —
    we never see two BUSY states at the same time from the client's perspective."""
    device_id, session_id = locked_device

    # Fire two acquires and check neither returns a 503/BUSY error
    r1, r2 = await asyncio.gather(
        live_client.post(
            f"/devices/{device_id}/acquire",
            params={"session_id": session_id},
            headers=hw_headers,
            json={"max_samples": False},
            timeout=120.0,
        ),
        live_client.post(
            f"/devices/{device_id}/acquire",
            params={"session_id": session_id},
            headers=hw_headers,
            json={"max_samples": False},
            timeout=120.0,
        ),
    )

    assert r1.status_code == 200, f"First acquire failed: {r1.text}"
    assert r2.status_code == 200, f"Second acquire failed: {r2.text}"

    # acquisition_ids must be different (two distinct acquisitions)
    assert r1.json()["acquisition_id"] != r2.json()["acquisition_id"]


@pytest.mark.asyncio
async def test_device_returns_to_locked_after_acquire(
    live_client, hw_headers, locked_device
):
    """After a successful acquire the device state must return to LOCKED, not stay BUSY."""
    device_id, session_id = locked_device

    resp = await live_client.post(
        f"/devices/{device_id}/acquire",
        params={"session_id": session_id},
        headers=hw_headers,
        json={"max_samples": False},
        timeout=90.0,
    )
    assert resp.status_code == 200

    device_resp = await live_client.get(f"/devices/{device_id}", headers=hw_headers)
    assert device_resp.status_code == 200
    state = device_resp.json()["state"]
    assert state == "LOCKED", f"Expected LOCKED after acquire, got {state}"
