"""Tests for session ownership, listing, uploaded status, commit by IDs, ZIP and HDF5 downloads."""

import io
import re
import zipfile
from unittest.mock import AsyncMock

import h5py
import numpy as np
import pytest

from app.config import settings
from app.instruments.base_driver import WaveformData
from app.openbis_client.client import UserInfo

HEADERS = {"Authorization": "Bearer tok"}
BOB = UserInfo(user_id="bob", display_name="Bob", is_admin=False)


async def _lock(client) -> str:
    resp = await client.post("/devices/scope-01/lock", headers=HEADERS)
    assert resp.status_code == 200, resp.text
    return resp.json()["control_session_id"]


async def _acquire(client, sid: str, **extra) -> dict:
    query = "".join(f"&{k}={v}" for k, v in extra.items())
    resp = await client.post(
        f"/devices/scope-01/acquire?session_id={sid}{query}", headers=HEADERS
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _flag(client, sid: str, ids: list[str], persist: bool = True) -> None:
    for art_id in ids:
        r = await client.post(
            f"/sessions/{sid}/artifacts/{art_id}/flag?persist={str(persist).lower()}",
            headers=HEADERS,
        )
        assert r.status_code == 200


def _wave(channel: int = 1) -> WaveformData:
    t = np.linspace(0, 1e-3, 20)
    return WaveformData(channel, t, np.sin(2e3 * np.pi * t), 1e6, 20)


# ---------------------------------------------------------------------------
# Ownership
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lock_registers_session_owner(app, async_client):
    sid = await _lock(async_client)
    info = app.state.buffer_service.get_session_info(sid)
    assert info.owner_user == "alice"
    assert info.device_id == "scope-01"
    assert info.created_at


@pytest.mark.asyncio
async def test_other_user_gets_403_on_every_session_route(app, async_client, act_as):
    sid = await _lock(async_client)
    acq = await _acquire(async_client, sid, channels=1)
    art = acq["artifact_ids"][0]
    act_as(BOB)
    urls = [
        ("get", f"/sessions/{sid}/artifacts"),
        ("post", f"/sessions/{sid}/artifacts/{art}/flag?persist=true"),
        ("get", f"/sessions/{sid}/artifacts/{art}/data"),
        ("get", f"/sessions/{sid}/artifacts/{art}/image"),
        ("get", f"/sessions/{sid}/download"),
        ("get", f"/sessions/{sid}/export.h5"),
    ]
    for method, url in urls:
        resp = await getattr(async_client, method)(url, headers=HEADERS)
        assert resp.status_code == 403, url
        assert resp.json()["error"] == "forbidden"
    resp = await async_client.post(
        f"/sessions/{sid}/acquisitions/{acq['acquisition_id']}/annotation",
        json={"annotation": "x"},
        headers=HEADERS,
    )
    assert resp.status_code == 403
    resp = await async_client.post(
        f"/sessions/{sid}/commit", json={"experiment_id": "/S/P/E"}, headers=HEADERS
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_may_access_foreign_session(app, async_client, act_as, admin_user):
    sid = await _lock(async_client)
    await _acquire(async_client, sid, channels=1)
    act_as(admin_user)
    resp = await async_client.get(f"/sessions/{sid}/artifacts", headers=HEADERS)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_legacy_session_without_owner_stays_accessible(app, async_client, act_as):
    app.state.buffer_service.store_waveform("scope-01", "legacy-sess", _wave(), meta={})
    act_as(BOB)
    resp = await async_client.get("/sessions/legacy-sess/artifacts", headers=HEADERS)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


# ---------------------------------------------------------------------------
# GET /sessions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mine_listing_with_counts(app, async_client):
    sid = await _lock(async_client)
    first = await _acquire(async_client, sid)
    await _acquire(async_client, sid)
    shot = await async_client.post(
        f"/devices/scope-01/screenshot?session_id={sid}", headers=HEADERS
    )
    await _flag(async_client, sid, first["artifact_ids"][:2])  # 2 channels, one capture
    await _flag(async_client, sid, [shot.json()["artifact_id"]])

    resp = await async_client.get("/sessions?mine=true", headers=HEADERS)
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["session_id"] == sid
    assert row["device_id"] == "scope-01"
    assert row["device_label"] == "Test Scope"
    assert row["owner_user"] == "alice"
    assert row["is_active"] is True
    assert row["counts"] == {
        "acquisitions": 2,
        "screenshots": 1,
        "flagged": 2,
        "uploaded": 0,
    }
    assert row["created_at"] <= row["last_activity"]
    arts = app.state.buffer_service.list_artifacts(sid)
    assert row["last_activity"] == max(a.created_at for a in arts)

    # after unlocking the session is no longer active
    await async_client.post(
        f"/devices/scope-01/unlock?session_id={sid}", headers=HEADERS
    )
    row = (await async_client.get("/sessions?mine=true", headers=HEADERS)).json()[0]
    assert row["is_active"] is False


@pytest.mark.asyncio
async def test_listing_is_newest_first_and_hides_empty_inactive_sessions(
    app, async_client
):
    sid1 = await _lock(async_client)
    await _acquire(async_client, sid1, channels=1)
    await async_client.post(
        f"/devices/scope-01/unlock?session_id={sid1}", headers=HEADERS
    )
    sid2 = await _lock(async_client)
    await _acquire(async_client, sid2, channels=1)
    await async_client.post(
        f"/devices/scope-01/unlock?session_id={sid2}", headers=HEADERS
    )
    sid3 = await _lock(async_client)  # nothing recorded
    await async_client.post(
        f"/devices/scope-01/unlock?session_id={sid3}", headers=HEADERS
    )

    rows = (
        await async_client.get("/sessions", headers=HEADERS)
    ).json()  # mine=true is the default
    assert [r["session_id"] for r in rows] == [sid2, sid1]


@pytest.mark.asyncio
async def test_mine_listing_excludes_other_users_and_legacy(
    app, async_client, act_as, admin_user
):
    sid = await _lock(async_client)
    await _acquire(async_client, sid, channels=1)
    app.state.buffer_service.store_waveform("scope-01", "legacy-sess", _wave(), meta={})

    act_as(BOB)
    assert (await async_client.get("/sessions?mine=true", headers=HEADERS)).json() == []
    denied = await async_client.get("/sessions?mine=false", headers=HEADERS)
    assert denied.status_code == 403

    act_as(admin_user)
    rows = (await async_client.get("/sessions?mine=false", headers=HEADERS)).json()
    assert {r["session_id"] for r in rows} == {sid, "legacy-sess"}
    legacy = next(r for r in rows if r["session_id"] == "legacy-sess")
    assert legacy["owner_user"] == ""
    assert (await async_client.get("/sessions?mine=true", headers=HEADERS)).json() == []


# ---------------------------------------------------------------------------
# Artifact upload status + commit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_artifacts_report_upload_defaults(async_client):
    sid = await _lock(async_client)
    await _acquire(async_client, sid, channels=1)
    art = (
        await async_client.get(f"/sessions/{sid}/artifacts", headers=HEADERS)
    ).json()[0]
    assert art["uploaded"] is False
    assert art["uploaded_at"] is None
    assert art["perm_id"] is None


@pytest.mark.asyncio
async def test_commit_with_artifact_ids_marks_uploaded_and_clears_persist(
    app, async_client, monkeypatch
):
    monkeypatch.setattr(settings, "OPENBIS_URL", "https://obis.example/openbis")
    monkeypatch.setattr(settings, "OPENBIS_USE_DROPBOX", False)
    app.state.openbis_client.create_dataset = AsyncMock(return_value="20261008-42")
    sid = await _lock(async_client)
    first = await _acquire(async_client, sid)
    second = await _acquire(async_client, sid)
    await _flag(
        async_client, sid, second["artifact_ids"]
    )  # flagged but NOT selected below

    chosen = first["artifact_ids"][:2]
    resp = await async_client.post(
        f"/sessions/{sid}/commit",
        json={"experiment_id": "/S/P/E", "artifact_ids": chosen},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["permId"] == "20261008-42"
    assert data["artifact_count"] == 2
    assert data["artifact_ids"] == chosen
    assert data["openbis_url"] == (
        "https://obis.example/openbis/webapp/eln-lims/?menuUniqueId=null"
        "&viewName=showViewDataSetPageFromPermId&viewData=20261008-42"
    )
    assert app.state.openbis_client.create_dataset.call_count == 1

    arts = {
        a["artifact_id"]: a
        for a in (
            await async_client.get(f"/sessions/{sid}/artifacts", headers=HEADERS)
        ).json()
    }
    for art_id in chosen:
        assert arts[art_id]["uploaded"] is True
        assert arts[art_id]["perm_id"] == "20261008-42"
        assert arts[art_id]["uploaded_at"]
        assert arts[art_id]["persist"] is False
    for art_id in second["artifact_ids"]:  # untouched
        assert arts[art_id]["uploaded"] is False
        assert arts[art_id]["persist"] is True

    row = (await async_client.get("/sessions", headers=HEADERS)).json()[0]
    assert row["counts"]["uploaded"] == 1
    assert row["counts"]["flagged"] == 1

    # a plain commit now uploads exactly the still-flagged artifacts
    again = await async_client.post(
        f"/sessions/{sid}/commit", json={"experiment_id": "/S/P/E"}, headers=HEADERS
    )
    assert again.json()["artifact_ids"] == second["artifact_ids"]


@pytest.mark.asyncio
async def test_commit_unknown_artifact_id_is_404(app, async_client):
    sid = await _lock(async_client)
    await _acquire(async_client, sid, channels=1)
    resp = await async_client.post(
        f"/sessions/{sid}/commit",
        json={"experiment_id": "/S/P/E", "artifact_ids": ["trace_9999_ch1"]},
        headers=HEADERS,
    )
    assert resp.status_code == 404
    assert resp.json()["error"] == "artifact_not_found"


@pytest.mark.asyncio
async def test_openbis_url_without_base_url_is_null(app, async_client, monkeypatch):
    monkeypatch.setattr(settings, "OPENBIS_URL", "")
    monkeypatch.setattr(settings, "OPENBIS_USE_DROPBOX", False)
    app.state.openbis_client.create_dataset = AsyncMock(return_value="PERM")
    sid = await _lock(async_client)
    acq = await _acquire(async_client, sid, channels=1)
    resp = await async_client.post(
        f"/sessions/{sid}/commit",
        json={"experiment_id": "/S/P/E", "artifact_ids": acq["artifact_ids"]},
        headers=HEADERS,
    )
    assert resp.json()["openbis_url"] is None


@pytest.mark.asyncio
async def test_dropbox_commit_still_marks_uploaded(
    app, async_client, monkeypatch, tmp_path
):
    monkeypatch.setattr(settings, "OPENBIS_USE_DROPBOX", True)
    monkeypatch.setattr(settings, "OPENBIS_DROPBOX_PATH", str(tmp_path / "drop"))
    sid = await _lock(async_client)
    acq = await _acquire(async_client, sid, channels=1)
    await _flag(async_client, sid, acq["artifact_ids"])
    resp = await async_client.post(
        f"/sessions/{sid}/commit", json={"experiment_id": "/S/P/E"}, headers=HEADERS
    )
    data = resp.json()
    assert data["permId"] is None
    assert data["openbis_url"] is None
    assert data["artifact_ids"] == acq["artifact_ids"]
    assert "dropbox_file" in data
    art = (
        await async_client.get(f"/sessions/{sid}/artifacts", headers=HEADERS)
    ).json()[0]
    assert art["uploaded"] is True
    assert art["perm_id"] is None
    assert art["persist"] is False


# ---------------------------------------------------------------------------
# Downloads
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_download_zip_whole_session_and_selection(app, async_client):
    sid = await _lock(async_client)
    first = await _acquire(async_client, sid)
    await _acquire(async_client, sid, channels=1)
    resp = await async_client.get(f"/sessions/{sid}/download", headers=HEADERS)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert re.fullmatch(
        r'attachment; filename="messdaten_scope-01_\d{8}-\d{4}\.zip"',
        resp.headers["content-disposition"],
    )
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        assert len(zf.namelist()) == 2  # merged 4-channel CSV + the single-channel CSV

    one = await async_client.get(
        f"/sessions/{sid}/download?artifact_ids={first['artifact_ids'][0]}",
        headers=HEADERS,
    )
    with zipfile.ZipFile(io.BytesIO(one.content)) as zf:
        assert len(zf.namelist()) == 1

    # nothing is marked as uploaded and no temp file is left behind
    arts = (
        await async_client.get(f"/sessions/{sid}/artifacts", headers=HEADERS)
    ).json()
    assert not any(a["uploaded"] for a in arts)
    session_dir = next(app.state.buffer_service._root.glob(f"*/{sid}"))
    assert list(session_dir.glob("download_*")) == []


@pytest.mark.asyncio
async def test_download_zip_errors(async_client):
    missing = await async_client.get("/sessions/nope/download", headers=HEADERS)
    assert missing.status_code == 404
    sid = await _lock(async_client)
    empty = await async_client.get(f"/sessions/{sid}/download", headers=HEADERS)
    assert empty.status_code == 400
    await _acquire(async_client, sid, channels=1)
    unknown = await async_client.get(
        f"/sessions/{sid}/download?artifact_ids=nope", headers=HEADERS
    )
    assert unknown.status_code == 404


@pytest.mark.asyncio
async def test_export_h5_contains_selected_traces(app, async_client):
    sid = await _lock(async_client)
    acq = await _acquire(async_client, sid)
    resp = await async_client.get(
        f"/sessions/{sid}/export.h5?artifact_ids={acq['artifact_ids'][0]}"
        f"&artifact_ids={acq['artifact_ids'][1]}",
        headers=HEADERS,
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/x-hdf5"
    assert re.fullmatch(
        r'attachment; filename="messdaten_scope-01_\d{8}-\d{4}\.h5"',
        resp.headers["content-disposition"],
    )
    with h5py.File(io.BytesIO(resp.content), "r") as h5:
        group = h5[acq["acquisition_id"]]
        assert sorted(group.keys()) == ["ch1", "ch2"]
        assert group["ch1"]["time_s"].shape == (1200,)

    whole = await async_client.get(f"/sessions/{sid}/export.h5", headers=HEADERS)
    with h5py.File(io.BytesIO(whole.content), "r") as h5:
        assert sorted(h5[acq["acquisition_id"]].keys()) == ["ch1", "ch2", "ch3", "ch4"]
    session_dir = next(app.state.buffer_service._root.glob(f"*/{sid}"))
    assert list(session_dir.glob("export_*.h5")) == []


@pytest.mark.asyncio
async def test_export_h5_without_traces_is_400(async_client):
    sid = await _lock(async_client)
    shot = await async_client.post(
        f"/devices/scope-01/screenshot?session_id={sid}", headers=HEADERS
    )
    resp = await async_client.get(
        f"/sessions/{sid}/export.h5?artifact_ids={shot.json()['artifact_id']}",
        headers=HEADERS,
    )
    assert resp.status_code == 400
