"""Integration tests for every OpenBIS call against a live server.

Run with:
    pytest tests/test_openbis_integration.py \
        --openbis-url https://openbis.example.com \
        --openbis-token <session-token>

Additional flags unlock deeper hierarchy tests:
    --openbis-space       GP_2025_WISE
    --openbis-project     DI_X_SMITH
    --openbis-collection  DI_X_SMITH_EXP_10
    --openbis-experiment  /GP_2025_WISE/DI_X_SMITH/DI_X_SMITH_EXP_10

All tests are skipped automatically when the required flags are absent.
"""

import asyncio

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.exceptions import AuthError, OpenBISError
from app.openbis_client.client import OpenBISClient

# ---------------------------------------------------------------------------
# Integration-specific fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def openbis_client(openbis_url, monkeypatch):
    """Real OpenBISClient pointed at the integration server."""
    from app import config

    monkeypatch.setattr(config.settings, "OPENBIS_URL", openbis_url)
    monkeypatch.setattr(config.settings, "DEBUG", False)
    return OpenBISClient()


@pytest_asyncio.fixture
async def integration_app(
    openbis_url, fake_redis, instrument_manager, buffer_service, monkeypatch
):
    """Full FastAPI app wired to the real OpenBIS URL — no mocked client."""
    from app import config
    from app.locks.service import LockService
    from app.main import create_app

    monkeypatch.setattr(config.settings, "OPENBIS_URL", openbis_url)
    monkeypatch.setattr(config.settings, "DEBUG", False)

    test_app = create_app()
    test_app.state.redis = fake_redis
    test_app.state.lock_service = LockService(fake_redis)
    test_app.state.instrument_manager = instrument_manager
    test_app.state.buffer_service = buffer_service
    test_app.state.openbis_client = OpenBISClient()

    for device_id, entry in instrument_manager.devices.items():
        entry.worker_task = asyncio.create_task(
            instrument_manager._device_worker(device_id),
            name=f"worker-{device_id}",
        )

    yield test_app

    for entry in instrument_manager.devices.values():
        if entry.worker_task and not entry.worker_task.done():
            entry.worker_task.cancel()
            try:
                await entry.worker_task
            except asyncio.CancelledError:
                pass


@pytest_asyncio.fixture
async def integration_client(integration_app):
    async with AsyncClient(
        transport=ASGITransport(app=integration_app), base_url="http://test"
    ) as client:
        yield client


# ---------------------------------------------------------------------------
# OpenBISClient.validate_token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_token_returns_user_info(openbis_client, openbis_token):
    """Valid token yields a UserInfo with a non-empty user_id."""
    info = await openbis_client.validate_token(openbis_token)

    assert info.user_id
    assert info.display_name
    assert isinstance(info.is_admin, bool)


@pytest.mark.asyncio
async def test_validate_token_result_stored_in_cache(openbis_client, openbis_token):
    """Result is stored in the TTL cache after first call."""
    await openbis_client.validate_token(openbis_token)

    assert openbis_token in openbis_client._cache


@pytest.mark.asyncio
async def test_validate_token_cache_hit_returns_same_object(
    openbis_client, openbis_token
):
    """Second call with the same token returns the identical cached object."""
    first = await openbis_client.validate_token(openbis_token)
    second = await openbis_client.validate_token(openbis_token)

    assert first is second


@pytest.mark.asyncio
async def test_validate_token_invalid_raises_auth_error(openbis_client):
    """A syntactically plausible but invalid token raises AuthError."""
    with pytest.raises(AuthError):
        await openbis_client.validate_token("not-a-real-openbis-token-xyz")


# ---------------------------------------------------------------------------
# OpenBISClient.create_dataset
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_dataset_returns_perm_id(
    openbis_client, openbis_token, openbis_experiment, tmp_path
):
    """create_dataset uploads a CSV as OSCILLOSCOPE type and returns a non-empty permId."""
    from datetime import datetime, timezone

    csv_file = tmp_path / "waveform.csv"
    csv_file.write_text("time,voltage\n0.0,0.0\n1e-6,0.5\n2e-6,1.0\n")
    now = datetime.now(timezone.utc)

    perm_id = await openbis_client.create_dataset(
        token=openbis_token,
        experiment_id=openbis_experiment,
        files=[str(csv_file)],
        dataset_type="OSCILLOSCOPE",
        properties={
            "dataset.lab_course": "EE101",
            "dataset.dso_experiment": "Integration test acquisition",
            "dataset.dso_description": "Automated integration test waveform",
            "dataset.dso_num_acquisitions": 1,
            "dataset.dso_timestamp_start": now.strftime("%Y-%m-%d %H:%M:%S"),
        },
    )

    assert perm_id
    assert isinstance(perm_id, str)


@pytest.mark.asyncio
async def test_api_commit_creates_oscilloscope_dataset(
    integration_client, integration_app, openbis_token, openbis_experiment
):
    """POST /sessions/{id}/commit uploads flagged artifacts as an OSCILLOSCOPE dataset."""
    import uuid
    import numpy as np
    from app.instruments.base_driver import WaveformData

    sess = str(uuid.uuid4())
    buf = integration_app.state.buffer_service
    t = np.linspace(0, 1e-3, 100)
    v = np.sin(2 * np.pi * 1000 * t)
    wf = WaveformData(
        channel=1,
        time_array=t,
        voltage_array=v,
        sample_rate=1e6,
        record_length=100,
    )
    art_id = buf.store_waveform("scope-01", sess, wf, meta={})
    buf.set_flag(sess, art_id, persist=True)

    resp = await integration_client.post(
        f"/sessions/{sess}/commit",
        json={
            "experiment_id": openbis_experiment,
            "lab_course": "EE101",
            "exp_title": "API integration test acquisition",
            "exp_description": "Full-stack commit test via POST /sessions/commit",
        },
        headers={"Authorization": f"Bearer {openbis_token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["permId"]
    assert isinstance(data["permId"], str)
    assert data["artifact_count"] == 1


@pytest.mark.asyncio
async def test_create_dataset_invalid_experiment_raises_error(
    openbis_client, openbis_token, tmp_path
):
    """create_dataset with a non-existent experiment identifier raises OpenBISError."""
    csv_file = tmp_path / "dummy.csv"
    csv_file.write_text("t,v\n0,0\n")

    with pytest.raises(OpenBISError):
        await openbis_client.create_dataset(
            token=openbis_token,
            experiment_id="/DOES/NOT/EXIST",
            files=[str(csv_file)],
            properties={},
        )


# ---------------------------------------------------------------------------
# API route: GET /auth/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_auth_me_valid_token(integration_client, openbis_token):
    """GET /auth/me with a live token returns 200 and a populated user_id."""
    resp = await integration_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {openbis_token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"]
    assert "is_admin" in data


@pytest.mark.asyncio
async def test_api_auth_me_invalid_token(integration_client):
    """GET /auth/me with a bad token returns 401."""
    resp = await integration_client.get(
        "/auth/me",
        headers={"Authorization": "Bearer completely-invalid-token"},
    )

    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# API route: GET /openbis/structure/projects
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_list_projects(integration_client, openbis_token, openbis_space):
    """GET /openbis/structure/projects returns a list of dicts with required keys."""
    params = {}
    if openbis_space:
        params["space"] = openbis_space

    resp = await integration_client.get(
        "/openbis/structure/projects",
        params=params,
        headers={"Authorization": f"Bearer {openbis_token}"},
    )

    assert resp.status_code == 200
    projects = resp.json()
    assert isinstance(projects, list)
    for project in projects:
        assert "code" in project
        assert "display_name" in project
        assert "semester" in project


# ---------------------------------------------------------------------------
# API route: GET /openbis/structure/collections
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_list_collections(
    integration_client, openbis_token, openbis_space, openbis_project
):
    """GET /openbis/structure/collections returns collection dicts for a project."""
    params = {"project": openbis_project}
    if openbis_space:
        params["space"] = openbis_space

    resp = await integration_client.get(
        "/openbis/structure/collections",
        params=params,
        headers={"Authorization": f"Bearer {openbis_token}"},
    )

    assert resp.status_code == 200
    collections = resp.json()
    assert isinstance(collections, list)
    for col in collections:
        assert "code" in col
        assert "display_name" in col


# ---------------------------------------------------------------------------
# API route: GET /openbis/structure/objects
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_list_objects(
    integration_client, openbis_token, openbis_space, openbis_collection
):
    """GET /openbis/structure/objects returns object dicts for a collection."""
    params = {"collection": openbis_collection}
    if openbis_space:
        params["space"] = openbis_space

    resp = await integration_client.get(
        "/openbis/structure/objects",
        params=params,
        headers={"Authorization": f"Bearer {openbis_token}"},
    )

    assert resp.status_code == 200
    objects = resp.json()
    assert isinstance(objects, list)
    for obj in objects:
        assert "code" in obj
        assert "type" in obj
        assert "identifier" in obj
