import asyncio
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import fakeredis.aioredis as fakeredis
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.buffer.service import BufferService
from app.instruments.manager import DeviceConfig, DeviceEntry, DeviceState, InstrumentManager
from app.instruments.mock_driver import MockOscilloscopeDriver
from app.locks.service import LockService
from app.openbis_client.client import UserInfo


# ---------------------------------------------------------------------------
# Fake Redis
# ---------------------------------------------------------------------------

@pytest.fixture
def fake_redis():
    return fakeredis.FakeRedis()


@pytest.fixture
def lock_service(fake_redis):
    return LockService(fake_redis)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@pytest.fixture
def regular_user():
    return UserInfo(user_id="alice", display_name="Alice", is_admin=False)


@pytest.fixture
def admin_user():
    return UserInfo(user_id="admin", display_name="Admin", is_admin=True)


# ---------------------------------------------------------------------------
# Mock driver + InstrumentManager
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_driver():
    return MockOscilloscopeDriver()


@pytest.fixture
def instrument_manager(mock_driver):
    manager = InstrumentManager()
    cfg = DeviceConfig(
        id="scope-01",
        ip="127.0.0.1",
        port=5025,
        label="Test Scope",
        driver_class_path="mock",
    )
    entry = DeviceEntry(config=cfg, state=DeviceState.ONLINE)
    entry.driver = mock_driver
    manager.devices["scope-01"] = entry
    return manager


# ---------------------------------------------------------------------------
# Buffer service
# ---------------------------------------------------------------------------

@pytest.fixture
def temp_buffer_dir(tmp_path):
    return tmp_path / "buffer"


@pytest.fixture
def buffer_service(temp_buffer_dir):
    return BufferService(buffer_dir=str(temp_buffer_dir))


# ---------------------------------------------------------------------------
# FastAPI test app
# ---------------------------------------------------------------------------

@pytest.fixture
def app(fake_redis, instrument_manager, buffer_service, regular_user):
    from app.main import create_app

    test_app = create_app()

    # Override lifespan by directly setting state
    ls = LockService(fake_redis)

    from app.openbis_client.client import OpenBISClient
    mock_openbis = MagicMock(spec=OpenBISClient)
    mock_openbis.validate_token = AsyncMock(return_value=regular_user)

    # Start worker tasks for devices
    async def _start_workers():
        for device_id, entry in instrument_manager.devices.items():
            entry.worker_task = asyncio.create_task(
                instrument_manager._device_worker(device_id),
                name=f"worker-{device_id}",
            )

    import asyncio as _asyncio
    loop = _asyncio.new_event_loop()
    loop.run_until_complete(_start_workers())

    test_app.state.redis = fake_redis
    test_app.state.lock_service = ls
    test_app.state.instrument_manager = instrument_manager
    test_app.state.buffer_service = buffer_service
    test_app.state.openbis_client = mock_openbis

    return test_app


@pytest_asyncio.fixture
async def async_client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
