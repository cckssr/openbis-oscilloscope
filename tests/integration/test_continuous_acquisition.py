"""
Continuous acquisition mode: run → acquire (repeated) → stop.

Verifies that repeated snapshots during a run() cycle each produce fresh data,
the device drains cleanly after stop(), and artifacts are correctly catalogued.
"""

import asyncio

import pytest


@pytest.mark.asyncio
async def test_run_acquire_stop_cycle(live_client, hw_headers, locked_device, live_app):
    """run() → 3× acquire() → stop() produces distinct acquisitions."""
    device_id, session_id = locked_device
    params = {"session_id": session_id}

    # Start continuous acquisition
    resp = await live_client.post(
        f"/devices/{device_id}/run", params=params, headers=hw_headers
    )
    assert resp.status_code == 200

    # Take three snapshots while running
    acquisition_ids = []
    for _ in range(3):
        resp = await live_client.post(
            f"/devices/{device_id}/acquire",
            params=params,
            headers=hw_headers,
            json={"max_samples": False},
            timeout=90.0,
        )
        assert resp.status_code == 200, f"Acquire during run failed: {resp.text}"
        acquisition_ids.append(resp.json()["acquisition_id"])
        await asyncio.sleep(0.2)  # brief pause between snapshots

    # Stop acquisition
    stop_resp = await live_client.post(
        f"/devices/{device_id}/stop", params=params, headers=hw_headers
    )
    assert stop_resp.status_code == 200

    # All three acquisition_ids must be distinct
    assert (
        len(set(acquisition_ids)) == 3
    ), f"Expected 3 distinct acquisition IDs, got: {acquisition_ids}"

    # Buffer must have at least 3 waveform artifacts for this session
    buffer_service = live_app.state.buffer_service
    artifacts = buffer_service.list_artifacts(session_id)
    waveform_artifacts = [a for a in artifacts if a.get("artifact_type") == "waveform"]
    assert len(waveform_artifacts) >= 3


@pytest.mark.asyncio
async def test_device_online_after_stop(live_client, hw_headers, locked_device):
    """After stop(), the device returns to LOCKED state (not BUSY or ERROR)."""
    device_id, session_id = locked_device
    params = {"session_id": session_id}

    await live_client.post(
        f"/devices/{device_id}/run", params=params, headers=hw_headers
    )
    await live_client.post(
        f"/devices/{device_id}/stop", params=params, headers=hw_headers
    )

    resp = await live_client.get(f"/devices/{device_id}", headers=hw_headers)
    assert resp.status_code == 200
    assert resp.json()["state"] == "LOCKED"


@pytest.mark.asyncio
async def test_acquire_without_run_works(live_client, hw_headers, locked_device):
    """acquire() without a preceding run() still returns valid waveform data
    (single-shot mode on the hardware)."""
    device_id, session_id = locked_device

    resp = await live_client.post(
        f"/devices/{device_id}/acquire",
        params={"session_id": session_id},
        headers=hw_headers,
        json={"max_samples": False},
        timeout=90.0,
    )
    assert resp.status_code == 200
    assert resp.json()["artifact_ids"]


@pytest.mark.asyncio
async def test_worker_queue_drains_after_stop(live_client, hw_headers, locked_device):
    """After run → N×acquire → stop, subsequent acquire returns immediately without
    queuing behind stale work items."""
    device_id, session_id = locked_device
    params = {"session_id": session_id}

    await live_client.post(
        f"/devices/{device_id}/run", params=params, headers=hw_headers
    )

    # Enqueue two acquires while running
    await asyncio.gather(
        live_client.post(
            f"/devices/{device_id}/acquire",
            params=params,
            headers=hw_headers,
            json={"max_samples": False},
            timeout=90.0,
        ),
        live_client.post(
            f"/devices/{device_id}/acquire",
            params=params,
            headers=hw_headers,
            json={"max_samples": False},
            timeout=90.0,
        ),
    )

    await live_client.post(
        f"/devices/{device_id}/stop", params=params, headers=hw_headers
    )

    # A fresh acquire after stop must succeed
    resp = await live_client.post(
        f"/devices/{device_id}/acquire",
        params=params,
        headers=hw_headers,
        json={"max_samples": False},
        timeout=90.0,
    )
    assert resp.status_code == 200
