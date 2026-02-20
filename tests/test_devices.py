import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

import fakeredis.aioredis as fakeredis
import pytest
from httpx import ASGITransport, AsyncClient

from app.buffer.service import BufferService
from app.instruments.manager import DeviceConfig, DeviceEntry, DeviceState, InstrumentManager
from app.instruments.mock_driver import MockOscilloscopeDriver
from app.locks.service import LockService
from app.openbis_client.client import OpenBISClient, UserInfo


def _build_app(user: UserInfo, fake_redis, manager: InstrumentManager, buf: BufferService):
    """Build a test FastAPI app without going through lifespan."""
    from app.main import create_app

    test_app = create_app()

    ls = LockService(fake_redis)
    mock_openbis = MagicMock(spec=OpenBISClient)
    mock_openbis.validate_token = AsyncMock(return_value=user)

    test_app.state.redis = fake_redis
    test_app.state.lock_service = ls
    test_app.state.instrument_manager = manager
    test_app.state.buffer_service = buf
    test_app.state.openbis_client = mock_openbis

    return test_app, ls


@pytest.fixture
def setup(tmp_path):
    user = UserInfo(user_id="alice", display_name="Alice", is_admin=False)
    redis = fakeredis.FakeRedis()
    driver = MockOscilloscopeDriver()
    driver.connect()

    manager = InstrumentManager()
    cfg = DeviceConfig(id="scope-01", ip="127.0.0.1", port=5025, label="Test", driver_class_path="mock")
    entry = DeviceEntry(config=cfg, state=DeviceState.ONLINE)
    entry.driver = driver
    manager.devices["scope-01"] = entry

    buf = BufferService(buffer_dir=str(tmp_path / "buffer"))
    app, ls = _build_app(user, redis, manager, buf)
    return app, ls, manager, buf, user


@pytest.mark.asyncio
async def test_list_devices(setup):
    app, ls, manager, buf, user = setup
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/devices", headers={"Authorization": "Bearer tok"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "scope-01"
    assert data[0]["state"] == "ONLINE"


@pytest.mark.asyncio
async def test_get_device(setup):
    app, ls, manager, buf, user = setup
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/devices/scope-01", headers={"Authorization": "Bearer tok"})
    assert resp.status_code == 200
    assert resp.json()["id"] == "scope-01"


@pytest.mark.asyncio
async def test_get_device_not_found(setup):
    app, ls, manager, buf, user = setup
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/devices/nonexistent", headers={"Authorization": "Bearer tok"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_acquire_and_release_lock(setup):
    app, ls, manager, buf, user = setup
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Acquire
        resp = await client.post("/devices/scope-01/lock", headers={"Authorization": "Bearer tok"})
        assert resp.status_code == 200
        data = resp.json()
        session_id = data["control_session_id"]
        assert session_id

        # State should be LOCKED
        lock = await ls.get_lock("scope-01")
        assert lock is not None
        assert lock.owner_user == "alice"

        # Release
        resp2 = await client.post(
            f"/devices/scope-01/unlock?session_id={session_id}",
            headers={"Authorization": "Bearer tok"},
        )
        assert resp2.status_code == 200
        assert resp2.json()["released"] is True


@pytest.mark.asyncio
async def test_lock_conflict(setup):
    app, ls, manager, buf, user = setup
    # Pre-lock as another user
    await ls.acquire_lock("scope-01", "bob", "sess-bob")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/devices/scope-01/lock", headers={"Authorization": "Bearer tok"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_heartbeat(setup):
    app, ls, manager, buf, user = setup
    session_id = str(uuid.uuid4())
    await ls.acquire_lock("scope-01", "alice", session_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/devices/scope-01/heartbeat?session_id={session_id}",
            headers={"Authorization": "Bearer tok"},
        )
    assert resp.status_code == 200
    assert resp.json()["renewed"] is True


@pytest.mark.asyncio
async def test_acquire_waveform(setup):
    app, ls, manager, buf, user = setup

    # Start worker task
    entry = manager.devices["scope-01"]
    task = asyncio.create_task(manager._device_worker("scope-01"))
    entry.worker_task = task

    try:
        session_id = str(uuid.uuid4())
        await ls.acquire_lock("scope-01", "alice", session_id)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/devices/scope-01/acquire?session_id={session_id}",
                headers={"Authorization": "Bearer tok"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "artifact_ids" in data
        assert len(data["artifact_ids"]) >= 1
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


@pytest.mark.asyncio
async def test_screenshot(setup):
    app, ls, manager, buf, user = setup

    entry = manager.devices["scope-01"]
    task = asyncio.create_task(manager._device_worker("scope-01"))
    entry.worker_task = task

    try:
        session_id = str(uuid.uuid4())
        await ls.acquire_lock("scope-01", "alice", session_id)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/devices/scope-01/screenshot?session_id={session_id}",
                headers={"Authorization": "Bearer tok"},
            )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


@pytest.mark.asyncio
async def test_command_without_lock_fails(setup):
    app, ls, manager, buf, user = setup

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/devices/scope-01/acquire?session_id=wrong-session",
            headers={"Authorization": "Bearer tok"},
        )
    assert resp.status_code == 403
