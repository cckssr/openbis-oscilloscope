"""Tests for capabilities, preview, acquire details, cancel/progress, scope commands and soft unlock."""

import asyncio
from datetime import datetime

import numpy as np
import pytest

from app.config import settings
from app.instruments.base_driver import BaseOscilloscopeDriver
from app.instruments.manager import DeviceState
from app.instruments.mock_driver import MockOscilloscopeDriver

HEADERS = {"Authorization": "Bearer tok"}


async def _lock(client, device="scope-01") -> str:
    resp = await client.post(f"/devices/{device}/lock", headers=HEADERS)
    assert resp.status_code == 200, resp.text
    return resp.json()["control_session_id"]


def _q(sid: str, **extra) -> str:
    return f"session_id={sid}" + "".join(f"&{k}={v}" for k, v in extra.items())


# ---------------------------------------------------------------------------
# Capabilities / channel_count
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_device_reports_capabilities_and_channel_count(async_client):
    resp = await async_client.get("/devices/scope-01", headers=HEADERS)
    data = resp.json()
    assert data["channel_count"] == 4
    assert data["capabilities"] == [
        "run",
        "stop",
        "acquire",
        "preview",
        "screenshot",
        "single",
        "force_trigger",
        "autoscale",
        "cancel_acquire",
    ]


@pytest.mark.asyncio
async def test_capabilities_derive_from_driver_class(async_client, instrument_manager):
    class Bare(MockOscilloscopeDriver):
        single = BaseOscilloscopeDriver.single
        force_trigger = BaseOscilloscopeDriver.force_trigger
        autoscale = BaseOscilloscopeDriver.autoscale
        supports_cancel_acquire = False

    instrument_manager.devices["scope-01"].driver = Bare()
    data = (await async_client.get("/devices/scope-01", headers=HEADERS)).json()
    assert data["capabilities"] == ["run", "stop", "acquire", "preview", "screenshot"]


@pytest.mark.asyncio
async def test_offline_device_has_no_capabilities(async_client, instrument_manager):
    instrument_manager.devices["scope-01"].driver = None
    data = (await async_client.get("/devices/scope-01", headers=HEADERS)).json()
    assert data["capabilities"] == []
    assert data["channel_count"] == 4


# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_preview_returns_frame_and_stores_nothing(app, async_client):
    sid = await _lock(async_client)
    resp = await async_client.post(
        f"/devices/scope-01/preview?{_q(sid)}", headers=HEADERS
    )
    assert resp.status_code == 200
    data = resp.json()
    assert [c["channel"] for c in data["channels"]] == [1, 2, 3, 4]
    assert [w["channel"] for w in data["waveforms"]] == [1, 2, 3, 4]
    for w in data["waveforms"]:
        assert w["artifact_id"] is None
        assert len(w["time_s"]) == len(w["voltage_V"]) == 1200
    assert set(data["timebase"]) == {"scale_s_div", "offset_s", "sample_rate"}
    assert set(data["trigger"]) == {"source", "level_v", "slope", "mode"}
    assert app.state.buffer_service.list_artifacts(sid) == []


@pytest.mark.asyncio
async def test_preview_channel_selection_and_validation(async_client):
    sid = await _lock(async_client)
    resp = await async_client.post(
        f"/devices/scope-01/preview?{_q(sid)}&channels=1&channels=3", headers=HEADERS
    )
    assert [w["channel"] for w in resp.json()["waveforms"]] == [1, 3]
    bad = await async_client.post(
        f"/devices/scope-01/preview?{_q(sid)}&channels=9", headers=HEADERS
    )
    assert bad.status_code == 400
    assert bad.json()["error"] == "validation_error"


@pytest.mark.asyncio
async def test_preview_defaults_to_enabled_channels_and_needs_lock(async_client):
    sid = await _lock(async_client)
    cfg = {
        "enabled": False,
        "scale_v_div": 1.0,
        "offset_v": 0.0,
        "coupling": "DC",
        "probe_attenuation": 1.0,
    }
    put = await async_client.put(
        f"/devices/scope-01/channels/2/config?{_q(sid)}", json=cfg, headers=HEADERS
    )
    assert put.status_code == 200
    resp = await async_client.post(
        f"/devices/scope-01/preview?{_q(sid)}", headers=HEADERS
    )
    assert [w["channel"] for w in resp.json()["waveforms"]] == [1, 3, 4]

    nolock = await async_client.post(
        "/devices/scope-01/preview?session_id=nope", headers=HEADERS
    )
    assert nolock.status_code == 403


# ---------------------------------------------------------------------------
# Acquire: include_data, created_at, timebase, trigger
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_acquire_without_include_data_has_metadata_only(app, async_client):
    sid = await _lock(async_client)
    resp = await async_client.post(
        f"/devices/scope-01/acquire?{_q(sid)}", headers=HEADERS
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "waveforms" not in data
    assert len(data["artifact_ids"]) == 4
    assert data["session_id"] == sid
    created = datetime.fromisoformat(data["created_at"])
    assert created.tzinfo is not None
    assert data["timebase"]["scale_s_div"] == pytest.approx(5e-4)
    assert data["trigger"] == {
        "source": "CH1",
        "level_v": 0.0,
        "slope": "RISE",
        "mode": "AUTO",
    }
    # every channel of the capture carries the same created_at and acquisition_id
    arts = app.state.buffer_service.list_artifacts(sid)
    assert {a.created_at for a in arts} == {data["created_at"]}
    assert {a.acquisition_id for a in arts} == {data["acquisition_id"]}


@pytest.mark.asyncio
async def test_acquire_include_data_returns_waveforms_with_artifact_ids(async_client):
    sid = await _lock(async_client)
    resp = await async_client.post(
        f"/devices/scope-01/acquire?{_q(sid, include_data='true')}&channels=1&channels=2",
        headers=HEADERS,
    )
    data = resp.json()
    assert [w["channel"] for w in data["waveforms"]] == [1, 2]
    assert [w["artifact_id"] for w in data["waveforms"]] == data["artifact_ids"]
    assert all(
        len(w["time_s"]) == len(w["voltage_V"]) == 1200 for w in data["waveforms"]
    )
    assert np.ptp(data["waveforms"][0]["voltage_V"]) == pytest.approx(2.0, abs=0.1)


@pytest.mark.asyncio
async def test_settings_changes_are_reflected_in_acquisitions(async_client):
    sid = await _lock(async_client)
    tb = await async_client.put(
        f"/devices/scope-01/timebase?{_q(sid)}",
        json={"scale_s_div": 1e-3, "offset_s": 0.0},
        headers=HEADERS,
    )
    assert tb.status_code == 200
    trig = await async_client.put(
        f"/devices/scope-01/trigger?{_q(sid)}",
        json={"source": "CH2", "level_v": 0.1, "slope": "FALL", "mode": "NORMAL"},
        headers=HEADERS,
    )
    assert trig.status_code == 200
    data = (
        await async_client.post(
            f"/devices/scope-01/preview?{_q(sid)}&channels=1", headers=HEADERS
        )
    ).json()
    t = data["waveforms"][0]["time_s"]
    assert t[-1] - t[0] == pytest.approx(10e-3, rel=0.01)
    assert data["timebase"]["scale_s_div"] == pytest.approx(1e-3)
    assert data["trigger"]["source"] == "CH2"
    bad = await async_client.put(
        f"/devices/scope-01/timebase?{_q(sid)}",
        json={"scale_s_div": 0},
        headers=HEADERS,
    )
    assert bad.status_code == 400


# ---------------------------------------------------------------------------
# Max-depth progress and cancel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_max_acquire_publishes_progress_events(app, async_client, mock_driver):
    mock_driver.block_delay_s = 0.03
    bus = app.state.event_bus
    q = bus.subscribe()
    sid = await _lock(async_client)
    resp = await async_client.post(
        f"/devices/scope-01/acquire?{_q(sid, max_samples='true')}&channels=1&channels=2",
        headers=HEADERS,
    )
    assert resp.status_code == 200
    events = []
    while not q.empty():
        e = q.get_nowait()
        if e["type"] == "progress":
            events.append(e)
    assert events, "expected progress events"
    assert all(e["job"] == "acquire" and e["device_id"] == "scope-01" for e in events)
    assert all(e["session_id"] == sid for e in events)
    dones = [e["done"] for e in events]
    assert dones == sorted(dones)
    assert dones[0] < 0.5 and dones[-1] == 1.0
    assert any("MPkt" in e["detail"] and e["detail"].startswith("CH") for e in events)
    assert len(events) <= 12  # throttled, not one event per block


@pytest.mark.asyncio
async def test_cancel_aborts_acquire_with_409_and_stores_nothing(
    app, async_client, mock_driver, instrument_manager
):
    mock_driver.max_depth = 40_000
    mock_driver.block_size = 5_000
    mock_driver.block_delay_s = 0.04
    sid = await _lock(async_client)
    task = asyncio.create_task(
        async_client.post(
            f"/devices/scope-01/acquire?{_q(sid, max_samples='true')}", headers=HEADERS
        )
    )
    await asyncio.sleep(0.15)  # inside the first channel's read
    cancel = await async_client.post(
        f"/devices/scope-01/acquire/cancel?{_q(sid)}", headers=HEADERS
    )
    assert cancel.json() == {"cancelled": True}
    resp = await asyncio.wait_for(task, timeout=10)
    assert resp.status_code == 409
    assert resp.json()["error"] == "acquisition_cancelled"
    assert app.state.buffer_service.list_artifacts(sid) == []
    # a cancel is not a device failure
    entry = instrument_manager.get_device("scope-01")
    assert entry.state == DeviceState.LOCKED
    assert entry.last_error is None
    # the next acquisition works and nothing is left over
    ok = await async_client.post(
        f"/devices/scope-01/acquire?{_q(sid)}", headers=HEADERS
    )
    assert ok.status_code == 200


@pytest.mark.asyncio
async def test_cancel_without_running_acquire_returns_false(async_client):
    sid = await _lock(async_client)
    resp = await async_client.post(
        f"/devices/scope-01/acquire/cancel?{_q(sid)}", headers=HEADERS
    )
    assert resp.status_code == 200
    assert resp.json() == {"cancelled": False}


@pytest.mark.asyncio
async def test_cancel_requires_lock(async_client):
    resp = await async_client.post(
        "/devices/scope-01/acquire/cancel?session_id=nope", headers=HEADERS
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Scope commands
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path,method",
    [
        ("single", "single"),
        ("force-trigger", "force_trigger"),
        ("autoscale", "autoscale"),
    ],
)
async def test_scope_commands_call_the_driver(async_client, mock_driver, path, method):
    sid = await _lock(async_client)
    resp = await async_client.post(
        f"/devices/scope-01/{path}?{_q(sid)}", headers=HEADERS
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": path}
    assert mock_driver.command_log == [method]


@pytest.mark.asyncio
async def test_autoscale_and_single_change_reported_settings(async_client):
    sid = await _lock(async_client)
    await async_client.put(
        f"/devices/scope-01/timebase?{_q(sid)}",
        json={"scale_s_div": 1.0, "offset_s": 0.0},
        headers=HEADERS,
    )
    await async_client.post(f"/devices/scope-01/autoscale?{_q(sid)}", headers=HEADERS)
    settings_ = (
        await async_client.get("/devices/scope-01/settings", headers=HEADERS)
    ).json()
    assert settings_["timebase"]["scale_s_div"] == pytest.approx(2e-4)
    await async_client.post(f"/devices/scope-01/single?{_q(sid)}", headers=HEADERS)
    settings_ = (
        await async_client.get("/devices/scope-01/settings", headers=HEADERS)
    ).json()
    assert settings_["trigger"]["mode"] == "SINGLE"
    assert sorted(settings_["channels"]) == ["1", "2", "3", "4"]


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["single", "force-trigger", "autoscale"])
async def test_unsupported_scope_command_is_400_not_supported(
    async_client, instrument_manager, path
):
    class Bare(MockOscilloscopeDriver):
        single = BaseOscilloscopeDriver.single
        force_trigger = BaseOscilloscopeDriver.force_trigger
        autoscale = BaseOscilloscopeDriver.autoscale

    instrument_manager.devices["scope-01"].driver = Bare()
    sid = await _lock(async_client)
    resp = await async_client.post(
        f"/devices/scope-01/{path}?{_q(sid)}", headers=HEADERS
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "not_supported"


@pytest.mark.asyncio
async def test_scope_commands_require_lock(async_client):
    resp = await async_client.post(
        "/devices/scope-01/autoscale?session_id=nope", headers=HEADERS
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Soft unlock
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_soft_unlock_keeps_lock_and_is_reclaimable(
    app, async_client, fake_redis, act_as, regular_user
):
    from app.openbis_client.client import UserInfo

    sid = await _lock(async_client)
    resp = await async_client.post(
        f"/devices/scope-01/unlock?{_q(sid)}&soft=true", headers=HEADERS
    )
    assert resp.status_code == 200
    assert resp.json() == {
        "released": False,
        "soft": True,
        "expires_in": settings.LOCK_SOFT_RELEASE_SECONDS,
    }
    ttl = await fake_redis.ttl("lock:scope-01")
    assert 0 < ttl <= settings.LOCK_SOFT_RELEASE_SECONDS

    # still LOCKED, and the owner can find the session again
    dev = (await async_client.get("/devices/scope-01", headers=HEADERS)).json()
    assert dev["state"] == "LOCKED"
    assert dev["lock"]["is_mine"] is True
    assert dev["lock"]["session_id"] == sid

    # somebody else still cannot take it
    act_as(UserInfo(user_id="bob", display_name="Bob", is_admin=False))
    taken = await async_client.post("/devices/scope-01/lock", headers=HEADERS)
    assert taken.status_code == 409
    act_as(regular_user)

    # the next heartbeat restores the full TTL
    hb = await async_client.post(
        f"/devices/scope-01/heartbeat?{_q(sid)}", headers=HEADERS
    )
    assert hb.status_code == 200
    assert await fake_redis.ttl("lock:scope-01") > settings.LOCK_SOFT_RELEASE_SECONDS


@pytest.mark.asyncio
async def test_soft_unlock_never_extends_a_shorter_ttl(async_client, fake_redis):
    sid = await _lock(async_client)
    await fake_redis.expire("lock:scope-01", 5)
    resp = await async_client.post(
        f"/devices/scope-01/unlock?{_q(sid)}&soft=true", headers=HEADERS
    )
    assert resp.json()["expires_in"] <= 5


@pytest.mark.asyncio
async def test_soft_unlock_wrong_session_is_403(async_client):
    await _lock(async_client)
    resp = await async_client.post(
        "/devices/scope-01/unlock?session_id=wrong&soft=true", headers=HEADERS
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_expired_soft_lock_returns_device_to_online(
    async_client, fake_redis, instrument_manager
):
    sid = await _lock(async_client)
    await async_client.post(
        f"/devices/scope-01/unlock?{_q(sid)}&soft=true", headers=HEADERS
    )
    assert instrument_manager.get_device("scope-01").state == DeviceState.LOCKED

    await fake_redis.delete("lock:scope-01")  # what Redis does when the TTL runs out
    listed = (await async_client.get("/devices", headers=HEADERS)).json()
    assert listed[0]["state"] == "ONLINE"
    assert listed[0]["lock"] is None
    assert instrument_manager.get_device("scope-01").state == DeviceState.ONLINE


@pytest.mark.asyncio
async def test_expired_lock_is_reconciled_by_get_device(async_client, fake_redis):
    await _lock(async_client)
    await fake_redis.delete("lock:scope-01")
    dev = (await async_client.get("/devices/scope-01", headers=HEADERS)).json()
    assert dev["state"] == "ONLINE"
    assert dev["lock"] is None


@pytest.mark.asyncio
async def test_hard_unlock_unchanged(async_client, instrument_manager):
    sid = await _lock(async_client)
    resp = await async_client.post(
        f"/devices/scope-01/unlock?{_q(sid)}", headers=HEADERS
    )
    assert resp.json() == {"released": True}
    assert instrument_manager.get_device("scope-01").state == DeviceState.ONLINE
