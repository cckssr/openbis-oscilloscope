"""Tests for session and artifact management endpoints."""

import uuid
from unittest.mock import AsyncMock

import numpy as np
import pytest

from app.instruments.base_driver import WaveformData
from app.openbis_client.client import UserInfo


def _make_waveform(channel: int = 1, n: int = 50) -> WaveformData:
    t = np.linspace(0, 1e-3, n)
    v = np.sin(2 * np.pi * 1000 * t)
    return WaveformData(
        channel=channel,
        time_array=t,
        voltage_array=v,
        sample_rate=1e6,
        record_length=n,
    )


HEADERS = {"Authorization": "Bearer tok"}


# ---------------------------------------------------------------------------
# GET /sessions/{session_id}/artifacts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_artifacts_missing_session(async_client):
    resp = await async_client.get(
        "/sessions/no-such-session/artifacts", headers=HEADERS
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_artifacts(app, async_client):
    buf = app.state.buffer_service
    art_id = buf.store_waveform("scope-01", "sess-list", _make_waveform(), meta={})

    resp = await async_client.get("/sessions/sess-list/artifacts", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["artifact_id"] == art_id
    assert data[0]["artifact_type"] == "trace"
    assert data[0]["channel"] == 1
    assert data[0]["persist"] is False


# ---------------------------------------------------------------------------
# POST /sessions/{session_id}/artifacts/{artifact_id}/flag
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_flag_artifact_set(app, async_client):
    buf = app.state.buffer_service
    art_id = buf.store_waveform("scope-01", "sess-flag", _make_waveform(), meta={})

    resp = await async_client.post(
        f"/sessions/sess-flag/artifacts/{art_id}/flag?persist=true",
        headers=HEADERS,
    )
    assert resp.status_code == 200
    assert resp.json() == {"artifact_id": art_id, "persist": True}

    flagged = buf.get_flagged_artifacts("sess-flag")
    assert len(flagged) == 1
    assert flagged[0].artifact_id == art_id


@pytest.mark.asyncio
async def test_flag_artifact_clear(app, async_client):
    buf = app.state.buffer_service
    art_id = buf.store_waveform("scope-01", "sess-unflag", _make_waveform(), meta={})
    buf.set_flag("sess-unflag", art_id, persist=True)

    resp = await async_client.post(
        f"/sessions/sess-unflag/artifacts/{art_id}/flag?persist=false",
        headers=HEADERS,
    )
    assert resp.status_code == 200
    assert resp.json()["persist"] is False
    assert buf.get_flagged_artifacts("sess-unflag") == []


# ---------------------------------------------------------------------------
# POST /sessions/{session_id}/commit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_commit_no_artifacts(async_client):
    """Session with no artifacts at all returns 404."""
    resp = await async_client.post(
        "/sessions/nonexistent-sess/commit",
        json={"experiment_id": "/S/P/E"},
        headers=HEADERS,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_commit_no_flagged_artifacts(app, async_client):
    """Session exists but no artifact is flagged → 400."""
    buf = app.state.buffer_service
    buf.store_waveform("scope-01", "sess-noflag", _make_waveform(), meta={})

    resp = await async_client.post(
        "/sessions/sess-noflag/commit",
        json={"experiment_id": "/S/P/E"},
        headers=HEADERS,
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "validation_error"


@pytest.mark.asyncio
async def test_commit_success(app, async_client):
    """Flagged artifact committed → returns permId and artifact_count."""
    buf = app.state.buffer_service
    sess = str(uuid.uuid4())
    art_id = buf.store_waveform("scope-01", sess, _make_waveform(), meta={})
    buf.set_flag(sess, art_id, persist=True)

    app.state.openbis_client.create_dataset = AsyncMock(return_value="20230101-99999")

    resp = await async_client.post(
        f"/sessions/{sess}/commit",
        json={"experiment_id": "/SPACE/PROJ/EXP"},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["permId"] == "20230101-99999"
    assert data["artifact_count"] == 1


@pytest.mark.asyncio
async def test_commit_multiple_flagged(app, async_client):
    """All flagged artifacts (trace + screenshot) are included in the commit."""
    buf = app.state.buffer_service
    sess = str(uuid.uuid4())
    art1 = buf.store_waveform("scope-01", sess, _make_waveform(channel=1), meta={})
    art2 = buf.store_waveform("scope-01", sess, _make_waveform(channel=2), meta={})
    buf.store_screenshot("scope-01", sess, b"\x89PNG")
    buf.set_flag(sess, art1, persist=True)
    buf.set_flag(sess, art2, persist=True)
    # screenshot not flagged

    app.state.openbis_client.create_dataset = AsyncMock(return_value="20230101-11111")

    resp = await async_client.post(
        f"/sessions/{sess}/commit",
        json={"experiment_id": "/SPACE/PROJ/EXP"},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    assert resp.json()["artifact_count"] == 2


@pytest.mark.asyncio
async def test_commit_sends_oscilloscope_properties(app, async_client):
    """commit maps request fields to DATASET.DSO_* keys and uses OSCILLOSCOPE type."""
    buf = app.state.buffer_service
    sess = str(uuid.uuid4())
    art_id = buf.store_waveform("scope-01", sess, _make_waveform(), meta={})
    buf.set_flag(sess, art_id, persist=True)

    mock_create = AsyncMock(return_value="PERM-001")
    app.state.openbis_client.create_dataset = mock_create

    resp = await async_client.post(
        f"/sessions/{sess}/commit",
        json={
            "experiment_id": "/S/P/E",
            "lab_course": "EE101",
            "exp_title": "RC Filter Test",
            "exp_description": "Measuring RC filter step response",
            "notes": "channel 1 only",
        },
        headers=HEADERS,
    )
    assert resp.status_code == 200

    mock_create.assert_called_once()
    call_kwargs = mock_create.call_args.kwargs
    assert call_kwargs["dataset_type"] == "OSCILLOSCOPE"
    props = call_kwargs["properties"]
    assert props["DATASET.LAB_COURSE"] == "EE101"
    assert props["DATASET.DSO_EXPERIMENT"] == "RC Filter Test"
    assert props["DATASET.DSO_DESCRIPTION"] == "Measuring RC filter step response"
    assert props["DATASET.DSO_NOTES"] == "channel 1 only"
    assert props["DATASET.DSO_NUM_ACQUISITIONS"] == 1
    assert "DATASET.DSO_TIMESTAMP_START" in props
    assert "DATASET.DSO_TIMESTAMP_END" in props
    assert "DATASET.DSO_DURATION_S" in props
    assert props["DATASET.DSO_HAS_CSV_EXPORT"] is True
    assert props["DATASET.DSO_HAS_SCREENSHOTS"] is False
    assert props["DATASET.DSO_NUM_CHANNELS_USED"] == 1


@pytest.mark.asyncio
async def test_commit_detects_screenshots(app, async_client):
    """has_screenshots is True when a screenshot is among the flagged artifacts."""
    buf = app.state.buffer_service
    sess = str(uuid.uuid4())
    art_id = buf.store_screenshot("scope-01", sess, b"\x89PNG")
    buf.set_flag(sess, art_id, persist=True)

    mock_create = AsyncMock(return_value="PERM-002")
    app.state.openbis_client.create_dataset = mock_create

    resp = await async_client.post(
        f"/sessions/{sess}/commit",
        json={"experiment_id": "/S/P/E"},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    props = mock_create.call_args.kwargs["properties"]
    assert props["DATASET.DSO_HAS_SCREENSHOTS"] is True
    assert props["DATASET.DSO_HAS_CSV_EXPORT"] is False


@pytest.mark.asyncio
async def test_commit_counts_channels_and_acquisitions(app, async_client):
    """num_channels_used and num_acquisitions are derived from flagged artifacts."""
    buf = app.state.buffer_service
    sess = str(uuid.uuid4())
    acq_id = str(uuid.uuid4())
    art1 = buf.store_waveform(
        "scope-01", sess, _make_waveform(channel=1), meta={}, acquisition_id=acq_id
    )
    art2 = buf.store_waveform(
        "scope-01", sess, _make_waveform(channel=2), meta={}, acquisition_id=acq_id
    )
    buf.set_flag(sess, art1, persist=True)
    buf.set_flag(sess, art2, persist=True)

    mock_create = AsyncMock(return_value="PERM-003")
    app.state.openbis_client.create_dataset = mock_create

    resp = await async_client.post(
        f"/sessions/{sess}/commit",
        json={"experiment_id": "/S/P/E"},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    props = mock_create.call_args.kwargs["properties"]
    assert props["DATASET.DSO_NUM_CHANNELS_USED"] == 2
    assert props["DATASET.DSO_NUM_ACQUISITIONS"] == 1  # one shared acquisition_id
