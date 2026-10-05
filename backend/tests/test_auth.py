from unittest.mock import AsyncMock

import pytest

from app.core.exceptions import AuthError
from app.openbis_client.client import UserInfo


@pytest.mark.asyncio
async def test_get_me_valid_token(async_client, app):
    user = UserInfo(user_id="alice", display_name="Alice", is_admin=False)
    app.state.openbis_client.validate_token = AsyncMock(return_value=user)

    resp = await async_client.get(
        "/auth/me", headers={"Authorization": "Bearer valid-token"}
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == "alice"
    assert data["is_admin"] is False


@pytest.mark.asyncio
async def test_get_me_missing_token(async_client):
    resp = await async_client.get("/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me_invalid_token(async_client, app):
    app.state.openbis_client.validate_token = AsyncMock(
        side_effect=AuthError("Token is invalid or expired")
    )

    resp = await async_client.get(
        "/auth/me", headers={"Authorization": "Bearer bad-token"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me_admin_user(async_client, app):
    admin = UserInfo(user_id="admin", display_name="Admin", is_admin=True)
    app.state.openbis_client.validate_token = AsyncMock(return_value=admin)

    resp = await async_client.get(
        "/auth/me", headers={"Authorization": "Bearer admin-token"}
    )

    assert resp.status_code == 200
    assert resp.json()["is_admin"] is True
