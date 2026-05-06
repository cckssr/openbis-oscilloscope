"""
Hardware-in-the-loop integration test fixtures.

Run with:
    pytest tests/integration --hw \\
        --openbis-url https://openbis.example.com \\
        --openbis-token $OPENBIS_TOKEN \\
        --openbis-test-space /SPACE/PROJECT/EXP

All tests in this package are skipped unless --hw is supplied.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import fakeredis.aioredis as fakeredis
import pytest
import pytest_asyncio
import yaml
from httpx import ASGITransport, AsyncClient

from app.buffer.service import BufferService
from app.instruments.manager import (
    DeviceConfig,
    DeviceEntry,
    DeviceState,
    InstrumentManager,
    _load_driver_class,
)
from app.locks.service import LockService
from app.openbis_client.client import OpenBISClient, UserInfo

# ---------------------------------------------------------------------------
# CLI options
# ---------------------------------------------------------------------------


def pytest_addoption(parser):
    parser.addoption(
        "--hw",
        action="store_true",
        default=False,
        help="Enable hardware integration tests (requires real oscilloscopes on LAN)",
    )
    parser.addoption(
        "--hw-config",
        default="config/oscilloscopes.test.yaml",
        help="Path to the hardware test YAML inventory (default: config/oscilloscopes.test.yaml)",
    )
    parser.addoption(
        "--openbis-test-space",
        default=None,
        help="Writable OpenBIS experiment path for commit tests (e.g. /SPACE/PROJECT/EXP)",
    )


# ---------------------------------------------------------------------------
# Skip gate — applied to every test in this package
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def require_hw(request):
    if not request.config.getoption("--hw"):
        pytest.skip("pass --hw to run hardware integration tests")


# ---------------------------------------------------------------------------
# Device inventory
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def hw_config_path(request) -> Path:
    path = Path(request.config.getoption("--hw-config"))
    if not path.exists():
        pytest.skip(
            f"Hardware config not found: {path}. "
            "Copy config/oscilloscopes.test.yaml and fill in real device IPs."
        )
    return path


@pytest.fixture(scope="session")
def hw_devices(hw_config_path) -> list[dict]:
    """Device entries from the test YAML, excluding mock-driver entries."""
    with hw_config_path.open() as f:
        raw = yaml.safe_load(f)
    devices = [
        d for d in raw.get("oscilloscopes", []) if d.get("driver", "mock") != "mock"
    ]
    if not devices:
        pytest.skip(
            "No real-driver devices found in hw_config. "
            "Set driver: 'drivers.YourDriver.ClassName' for at least one device."
        )
    return devices


@pytest.fixture(scope="session")
def device_ids(hw_devices) -> list[str]:
    return [d["id"] for d in hw_devices]


@pytest.fixture(scope="session")
def first_device_id(device_ids) -> str:
    return device_ids[0]


# ---------------------------------------------------------------------------
# Auth constants used throughout hardware tests
# ---------------------------------------------------------------------------

HW_TEST_TOKEN = "hw-test-token"
HW_TEST_USER = UserInfo(user_id="hw-test-user", display_name="HW Test", is_admin=True)


@pytest.fixture
def hw_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {HW_TEST_TOKEN}"}


# ---------------------------------------------------------------------------
# InstrumentManager with real drivers connected
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def live_manager(hw_devices, tmp_path):
    """InstrumentManager with all test devices connected to real LAN hardware."""
    manager = InstrumentManager()

    for item in hw_devices:
        cfg = DeviceConfig(
            id=item["id"],
            ip=item["ip"],
            port=item.get("port", 5025),
            label=item.get("label", item["id"]),
            driver_class_path=item["driver"],
        )
        entry = DeviceEntry(config=cfg, state=DeviceState.OFFLINE)
        manager.devices[cfg.id] = entry

        driver_class = _load_driver_class(cfg.driver_class_path)
        driver = driver_class(ip=cfg.ip, port=cfg.port)
        try:
            driver.connect()
            entry.driver = driver
            entry.state = DeviceState.ONLINE
        except Exception as exc:
            pytest.skip(f"Could not connect to {cfg.id} at {cfg.ip}:{cfg.port} — {exc}")

    yield manager

    for entry in manager.devices.values():
        if entry.driver:
            try:
                entry.driver.disconnect()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Full app with real drivers, mock OpenBISClient
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def live_app(live_manager, tmp_path):
    """FastAPI app wired to real drivers. OpenBISClient accepts HW_TEST_TOKEN."""
    from app.main import create_app

    redis = fakeredis.FakeRedis()
    buffer = BufferService(buffer_dir=str(tmp_path / "buffer"))

    mock_openbis = MagicMock(spec=OpenBISClient)
    mock_openbis.validate_token = AsyncMock(return_value=HW_TEST_USER)

    test_app = create_app()
    test_app.state.redis = redis
    test_app.state.lock_service = LockService(redis)
    test_app.state.instrument_manager = live_manager
    test_app.state.buffer_service = buffer
    test_app.state.openbis_client = mock_openbis

    for device_id, entry in live_manager.devices.items():
        entry.worker_task = asyncio.create_task(
            live_manager._device_worker(device_id), name=f"worker-{device_id}"
        )

    yield test_app

    for entry in live_manager.devices.values():
        if entry.worker_task and not entry.worker_task.done():
            entry.worker_task.cancel()
            try:
                await entry.worker_task
            except asyncio.CancelledError:
                pass


@pytest_asyncio.fixture
async def live_client(live_app) -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=live_app), base_url="http://test"
    ) as client:
        yield client


# ---------------------------------------------------------------------------
# Full app with real drivers AND real OpenBISClient (for commit tests)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def live_app_openbis(live_manager, tmp_path, monkeypatch, request):
    """FastAPI app with real drivers and a real OpenBISClient."""
    from app import config
    from app.main import create_app

    openbis_url = request.config.getoption("--openbis-url", default=None)
    if not openbis_url:
        openbis_url = os.environ.get("OPENBIS_TEST_URL")
    if not openbis_url:
        pytest.skip("pass --openbis-url or set OPENBIS_TEST_URL for commit tests")

    monkeypatch.setattr(config.settings, "OPENBIS_URL", openbis_url)
    monkeypatch.setattr(config.settings, "DEBUG", False)

    redis = fakeredis.FakeRedis()
    buffer = BufferService(buffer_dir=str(tmp_path / "buffer"))

    test_app = create_app()
    test_app.state.redis = redis
    test_app.state.lock_service = LockService(redis)
    test_app.state.instrument_manager = live_manager
    test_app.state.buffer_service = buffer
    test_app.state.openbis_client = OpenBISClient()

    for device_id, entry in live_manager.devices.items():
        entry.worker_task = asyncio.create_task(
            live_manager._device_worker(device_id), name=f"worker-{device_id}"
        )

    yield test_app

    for entry in live_manager.devices.values():
        if entry.worker_task and not entry.worker_task.done():
            entry.worker_task.cancel()
            try:
                await entry.worker_task
            except asyncio.CancelledError:
                pass


@pytest_asyncio.fixture
async def live_client_openbis(live_app_openbis) -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=live_app_openbis), base_url="http://test"
    ) as client:
        yield client


@pytest.fixture
def openbis_hw_token(request) -> str:
    val = request.config.getoption("--openbis-token", default=None)
    if not val:
        val = os.environ.get("OPENBIS_TEST_TOKEN") or os.environ.get("OPENBIS_TOKEN")
    if not val:
        pytest.skip("pass --openbis-token or set OPENBIS_TEST_TOKEN for commit tests")
    return val


@pytest.fixture
def openbis_hw_headers(openbis_hw_token) -> dict[str, str]:
    return {"Authorization": f"Bearer {openbis_hw_token}"}


@pytest.fixture
def openbis_test_space(request) -> str:
    val = request.config.getoption("--openbis-test-space", default=None)
    if not val:
        val = os.environ.get("OPENBIS_TEST_SPACE")
    if not val:
        pytest.skip(
            "pass --openbis-test-space or set OPENBIS_TEST_SPACE for commit tests"
        )
    return val


# ---------------------------------------------------------------------------
# Convenience: lock a device and yield (device_id, session_id)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def locked_device(live_client, hw_headers, first_device_id):
    """Acquire a lock on the first device; release it after the test."""
    resp = await live_client.post(
        f"/devices/{first_device_id}/lock", headers=hw_headers
    )
    assert resp.status_code == 200, f"Lock failed: {resp.text}"
    session_id = resp.json()["control_session_id"]

    yield first_device_id, session_id

    await live_client.post(
        f"/devices/{first_device_id}/unlock",
        params={"session_id": session_id},
        headers=hw_headers,
    )
