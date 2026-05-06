"""
Multi-device parallelism: concurrent acquisitions on N scopes must finish faster
than sequential execution and must not cross-contaminate artifact storage.
"""

import asyncio
import time

import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_parallel_acquire_faster_than_sequential(
    live_client, hw_headers, device_ids
):
    if len(device_ids) < 2:
        pytest.skip("Need at least 2 real devices to test parallelism")

    # --- measure single-device baseline ---
    resp = await live_client.post(f"/devices/{device_ids[0]}/lock", headers=hw_headers)
    assert resp.status_code == 200
    sid0 = resp.json()["control_session_id"]

    t0 = time.monotonic()
    await live_client.post(
        f"/devices/{device_ids[0]}/acquire",
        params={"session_id": sid0},
        headers=hw_headers,
        json={"max_samples": False},
        timeout=90.0,
    )
    single_time = time.monotonic() - t0

    await live_client.post(
        f"/devices/{device_ids[0]}/unlock",
        params={"session_id": sid0},
        headers=hw_headers,
    )

    # --- lock all devices ---
    sessions: dict[str, str] = {}
    for dev_id in device_ids:
        resp = await live_client.post(f"/devices/{dev_id}/lock", headers=hw_headers)
        assert resp.status_code == 200, f"Lock failed for {dev_id}: {resp.text}"
        sessions[dev_id] = resp.json()["control_session_id"]

    # --- fire all acquisitions concurrently ---
    t_start = time.monotonic()
    results = await asyncio.gather(
        *[
            live_client.post(
                f"/devices/{dev_id}/acquire",
                params={"session_id": sessions[dev_id]},
                headers=hw_headers,
                json={"max_samples": False},
                timeout=90.0,
            )
            for dev_id in device_ids
        ]
    )
    parallel_time = time.monotonic() - t_start

    # --- unlock all ---
    for dev_id in device_ids:
        await live_client.post(
            f"/devices/{dev_id}/unlock",
            params={"session_id": sessions[dev_id]},
            headers=hw_headers,
        )

    # --- assertions ---
    for resp, dev_id in zip(results, device_ids):
        assert resp.status_code == 200, f"Acquire failed for {dev_id}: {resp.text}"

    expected_sequential_time = single_time * len(device_ids)
    assert parallel_time < expected_sequential_time * 0.7, (
        f"Parallel time {parallel_time:.2f}s not faster than 70% of sequential "
        f"{expected_sequential_time:.2f}s — devices may not be executing in parallel"
    )


@pytest.mark.asyncio
async def test_artifact_isolation_per_device(
    live_client, hw_headers, device_ids, live_app
):
    """Artifacts from each device land under their own device_id tree, no cross-pollution."""
    if len(device_ids) < 2:
        pytest.skip("Need at least 2 real devices to test artifact isolation")

    sessions: dict[str, str] = {}
    for dev_id in device_ids:
        resp = await live_client.post(f"/devices/{dev_id}/lock", headers=hw_headers)
        assert resp.status_code == 200
        sessions[dev_id] = resp.json()["control_session_id"]

    results = await asyncio.gather(
        *[
            live_client.post(
                f"/devices/{dev_id}/acquire",
                params={"session_id": sessions[dev_id]},
                headers=hw_headers,
                json={"max_samples": False},
                timeout=90.0,
            )
            for dev_id in device_ids
        ]
    )

    for dev_id in device_ids:
        await live_client.post(
            f"/devices/{dev_id}/unlock",
            params={"session_id": sessions[dev_id]},
            headers=hw_headers,
        )

    # Verify buffer service: each session's artifacts belong only to its device
    buffer_service = live_app.state.buffer_service
    for resp, dev_id in zip(results, device_ids):
        assert resp.status_code == 200
        data = resp.json()
        session_id = sessions[dev_id]
        artifacts = buffer_service.list_artifacts(session_id)
        assert artifacts, f"No artifacts found for session {session_id} on {dev_id}"

        # Verify the buffer path contains the correct device_id
        import os

        for artifact in artifacts:
            for file_path in artifact.get("files", []):
                assert (
                    dev_id in file_path
                ), f"Artifact file {file_path} does not contain device_id {dev_id}"


@pytest.mark.asyncio
async def test_different_devices_can_be_locked_by_same_user(
    live_client, hw_headers, device_ids
):
    """A single user can hold locks on multiple devices simultaneously."""
    if len(device_ids) < 2:
        pytest.skip("Need at least 2 real devices")

    sessions = {}
    for dev_id in device_ids:
        resp = await live_client.post(f"/devices/{dev_id}/lock", headers=hw_headers)
        assert (
            resp.status_code == 200
        ), f"Expected to lock {dev_id} but got {resp.status_code}: {resp.text}"
        sessions[dev_id] = resp.json()["control_session_id"]

    for dev_id in device_ids:
        await live_client.post(
            f"/devices/{dev_id}/unlock",
            params={"session_id": sessions[dev_id]},
            headers=hw_headers,
        )
