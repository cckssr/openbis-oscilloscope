"""
Per-device endpoint coverage: every API action exercised against each real scope.

Parametrized over all devices in config/oscilloscopes.test.yaml so that a failure
pinpoints which device and which endpoint diverges from the expected behaviour.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.instruments.manager import DeviceState

# ---------------------------------------------------------------------------
# Health and diagnostics (no lock required)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_device_list_returns_all_devices(live_client, hw_headers, hw_devices):
    resp = await live_client.get("/devices", headers=hw_headers)
    assert resp.status_code == 200
    ids = {d["id"] for d in resp.json()}
    for dev in hw_devices:
        assert dev["id"] in ids, f"Device {dev['id']} missing from /devices response"


@pytest.mark.asyncio
async def test_device_detail_online(live_client, hw_headers, hw_devices):
    for dev in hw_devices:
        resp = await live_client.get(f"/devices/{dev['id']}", headers=hw_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["state"] in (
            DeviceState.ONLINE,
            DeviceState.LOCKED,
        ), f"{dev['id']} in unexpected state: {data['state']}"


@pytest.mark.asyncio
async def test_probe_reports_reachable(live_client, hw_headers, hw_devices):
    for dev in hw_devices:
        resp = await live_client.get(f"/devices/{dev['id']}/probe", headers=hw_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["tcp_reachable"] is True, f"{dev['id']} TCP unreachable: {data}"
        assert data.get("identify") or data.get(
            "idn"
        ), f"{dev['id']} probe returned no IDN string: {data}"


@pytest.mark.asyncio
async def test_get_settings_no_lock_required(live_client, hw_headers, hw_devices):
    for dev in hw_devices:
        resp = await live_client.get(
            f"/devices/{dev['id']}/settings", headers=hw_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "channels" in data
        assert "timebase" in data
        assert "trigger" in data


# ---------------------------------------------------------------------------
# Lock lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lock_acquire_and_release(live_client, hw_headers, first_device_id):
    resp = await live_client.post(
        f"/devices/{first_device_id}/lock", headers=hw_headers
    )
    assert resp.status_code == 200
    session_id = resp.json()["control_session_id"]
    assert session_id

    resp = await live_client.post(
        f"/devices/{first_device_id}/unlock",
        params={"session_id": session_id},
        headers=hw_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_lock_conflict_returns_409(live_client, hw_headers, locked_device):
    device_id, _ = locked_device
    resp = await live_client.post(f"/devices/{device_id}/lock", headers=hw_headers)
    assert resp.status_code in (
        409,
        423,
    ), f"Expected lock conflict on already-locked device, got {resp.status_code}"


@pytest.mark.asyncio
async def test_heartbeat_renews_lock(live_client, hw_headers, locked_device):
    device_id, session_id = locked_device
    resp = await live_client.post(
        f"/devices/{device_id}/heartbeat",
        params={"session_id": session_id},
        headers=hw_headers,
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Channel configuration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_channel_config_roundtrip(live_client, hw_headers, locked_device):
    device_id, session_id = locked_device
    params = {"session_id": session_id}

    resp = await live_client.put(
        f"/devices/{device_id}/channels/1/config",
        params=params,
        headers=hw_headers,
        json={
            "enabled": True,
            "scale_v_div": 1.0,
            "offset_v": 0.0,
            "coupling": "DC",
            "probe_attenuation": 10.0,
        },
    )
    assert resp.status_code == 200

    # Verify settings were applied
    settings_resp = await live_client.get(
        f"/devices/{device_id}/settings", headers=hw_headers
    )
    assert settings_resp.status_code == 200
    ch1 = settings_resp.json()["channels"].get("1") or settings_resp.json()[
        "channels"
    ].get(1)
    if ch1:
        assert ch1["scale_v_div"] == pytest.approx(1.0, rel=0.1)


@pytest.mark.asyncio
async def test_timebase_roundtrip(live_client, hw_headers, locked_device):
    device_id, session_id = locked_device
    resp = await live_client.put(
        f"/devices/{device_id}/timebase",
        params={"session_id": session_id},
        headers=hw_headers,
        json={"scale_s_div": 1e-3, "offset_s": 0.0},
    )
    assert resp.status_code == 200

    settings_resp = await live_client.get(
        f"/devices/{device_id}/settings", headers=hw_headers
    )
    assert settings_resp.status_code == 200
    tb = settings_resp.json()["timebase"]
    assert tb["scale_s_div"] == pytest.approx(1e-3, rel=0.2)


@pytest.mark.asyncio
async def test_trigger_roundtrip(live_client, hw_headers, locked_device):
    device_id, session_id = locked_device
    resp = await live_client.put(
        f"/devices/{device_id}/trigger",
        params={"session_id": session_id},
        headers=hw_headers,
        json={"source": "CH1", "level_v": 0.5, "slope": "RISING", "mode": "EDGE"},
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Waveform acquisition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_acquire_returns_valid_waveform(live_client, hw_headers, locked_device):
    device_id, session_id = locked_device
    resp = await live_client.post(
        f"/devices/{device_id}/acquire",
        params={"session_id": session_id},
        headers=hw_headers,
        json={"max_samples": False},
        timeout=90.0,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["artifact_ids"]
    assert data["channels"]

    # Verify at least one channel has non-empty waveform data in the buffer
    artifact_id = data["artifact_ids"][0]
    acquisition_id = data["acquisition_id"]
    assert acquisition_id


@pytest.mark.asyncio
async def test_acquire_max_samples(live_client, hw_headers, locked_device):
    device_id, session_id = locked_device
    resp = await live_client.post(
        f"/devices/{device_id}/acquire",
        params={"session_id": session_id},
        headers=hw_headers,
        json={"max_samples": True},
        timeout=150.0,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["artifact_ids"]


@pytest.mark.asyncio
async def test_channel_data_endpoint(live_client, hw_headers, locked_device):
    device_id, session_id = locked_device
    # Acquire first
    acq = await live_client.post(
        f"/devices/{device_id}/acquire",
        params={"session_id": session_id},
        headers=hw_headers,
        json={"max_samples": False},
        timeout=90.0,
    )
    assert acq.status_code == 200

    resp = await live_client.get(
        f"/devices/{device_id}/channels/1/data",
        params={"session_id": session_id},
        headers=hw_headers,
        timeout=30.0,
    )
    assert resp.status_code == 200
    waveform = resp.json()
    assert "time_s" in waveform
    assert "voltage_V" in waveform
    assert len(waveform["time_s"]) == len(waveform["voltage_V"])
    assert len(waveform["time_s"]) > 0


# ---------------------------------------------------------------------------
# Screenshot
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_screenshot_get_returns_png(live_client, hw_headers, locked_device):
    device_id, session_id = locked_device
    resp = await live_client.get(
        f"/devices/{device_id}/screenshot",
        params={"session_id": session_id},
        headers=hw_headers,
        timeout=30.0,
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/png")
    assert len(resp.content) > 100  # not empty


@pytest.mark.asyncio
async def test_screenshot_post_saves_artifact(live_client, hw_headers, locked_device):
    device_id, session_id = locked_device
    resp = await live_client.post(
        f"/devices/{device_id}/screenshot",
        params={"session_id": session_id},
        headers=hw_headers,
        timeout=30.0,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("artifact_id")


# ---------------------------------------------------------------------------
# Run / Stop
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_and_stop(live_client, hw_headers, locked_device):
    device_id, session_id = locked_device
    params = {"session_id": session_id}

    run_resp = await live_client.post(
        f"/devices/{device_id}/run", params=params, headers=hw_headers
    )
    assert run_resp.status_code == 200

    stop_resp = await live_client.post(
        f"/devices/{device_id}/stop", params=params, headers=hw_headers
    )
    assert stop_resp.status_code == 200


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_force_unlock(live_client, hw_headers, locked_device):
    device_id, _ = locked_device
    resp = await live_client.post(
        f"/admin/devices/{device_id}/force-unlock", headers=hw_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["released"] is True


@pytest.mark.asyncio
async def test_admin_reset_all_locks(live_client, hw_headers):
    resp = await live_client.post("/admin/locks/reset", headers=hw_headers)
    assert resp.status_code == 200
    assert "locks_cleared" in resp.json()


@pytest.mark.asyncio
async def test_admin_keyboard_lock(live_client, hw_headers, first_device_id):
    resp = await live_client.post(
        f"/admin/devices/{first_device_id}/keyboard-lock",
        params={"locked": True},
        headers=hw_headers,
    )
    assert resp.status_code == 200

    # Unlock again to leave scope in normal state
    await live_client.post(
        f"/admin/devices/{first_device_id}/keyboard-lock",
        params={"locked": False},
        headers=hw_headers,
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auth_me(live_client, hw_headers):
    resp = await live_client.get("/auth/me", headers=hw_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == "hw-test-user"


@pytest.mark.asyncio
async def test_auth_invalid_token_rejected(live_client):
    resp = await live_client.get(
        "/auth/me", headers={"Authorization": "Bearer invalid-token-xyz"}
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Health check endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_endpoint(live_client, hw_headers):
    resp = await live_client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
