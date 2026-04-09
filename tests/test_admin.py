"""Tests for admin-only lock management endpoints."""

import uuid
from unittest.mock import AsyncMock

import pytest

from app.instruments.manager import DeviceState
from app.openbis_client.client import UserInfo


ADMIN_HEADERS = {"Authorization": "Bearer admin-tok"}
USER_HEADERS = {"Authorization": "Bearer tok"}


def _make_admin_mock(app):
    admin = UserInfo(user_id="admin", display_name="Admin", is_admin=True)
    app.state.openbis_client.validate_token = AsyncMock(return_value=admin)


# ---------------------------------------------------------------------------
# POST /admin/locks/reset
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_all_locks_non_admin(async_client):
    """Regular user gets 403."""
    resp = await async_client.post("/admin/locks/reset", headers=USER_HEADERS)
    assert resp.status_code == 403
    assert resp.json()["error"] == "admin_required"


@pytest.mark.asyncio
async def test_reset_all_locks_admin(app, async_client):
    """Admin clears all locks; LOCKED devices transition to ONLINE."""
    _make_admin_mock(app)

    ls = app.state.lock_service
    manager = app.state.instrument_manager

    sess = str(uuid.uuid4())
    await ls.acquire_lock("scope-01", "alice", sess)
    manager.update_state("scope-01", DeviceState.LOCKED)

    resp = await async_client.post("/admin/locks/reset", headers=ADMIN_HEADERS)
    assert resp.status_code == 200
    assert resp.json()["locks_cleared"] >= 1

    assert await ls.get_lock("scope-01") is None
    assert manager.devices["scope-01"].state == DeviceState.ONLINE


@pytest.mark.asyncio
async def test_reset_all_locks_empty(app, async_client):
    """Reset with no active locks returns 0."""
    _make_admin_mock(app)
    resp = await async_client.post("/admin/locks/reset", headers=ADMIN_HEADERS)
    assert resp.status_code == 200
    assert resp.json()["locks_cleared"] == 0


# ---------------------------------------------------------------------------
# POST /admin/devices/{device_id}/force-unlock
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_force_unlock_non_admin(async_client):
    """Regular user gets 403."""
    resp = await async_client.post(
        "/admin/devices/scope-01/force-unlock", headers=USER_HEADERS
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_force_unlock_device_not_found(app, async_client):
    """Unknown device_id returns 404."""
    _make_admin_mock(app)
    resp = await async_client.post(
        "/admin/devices/nonexistent/force-unlock", headers=ADMIN_HEADERS
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_force_unlock_releases_lock(app, async_client):
    """Admin force-unlocks a locked device; state transitions to ONLINE."""
    _make_admin_mock(app)

    ls = app.state.lock_service
    manager = app.state.instrument_manager

    sess = str(uuid.uuid4())
    await ls.acquire_lock("scope-01", "alice", sess)
    manager.update_state("scope-01", DeviceState.LOCKED)

    resp = await async_client.post(
        "/admin/devices/scope-01/force-unlock", headers=ADMIN_HEADERS
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["released"] is True
    assert data["device_id"] == "scope-01"

    assert await ls.get_lock("scope-01") is None
    assert manager.devices["scope-01"].state == DeviceState.ONLINE


@pytest.mark.asyncio
async def test_force_unlock_already_unlocked(app, async_client):
    """Force-unlock on a device with no lock returns released=false."""
    _make_admin_mock(app)
    resp = await async_client.post(
        "/admin/devices/scope-01/force-unlock", headers=ADMIN_HEADERS
    )
    assert resp.status_code == 200
    assert resp.json()["released"] is False
