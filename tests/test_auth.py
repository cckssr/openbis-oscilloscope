from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.exceptions import AuthError
from app.openbis_client.client import UserInfo


@pytest.mark.asyncio
async def test_get_me_valid_token(app):
    """Valid token returns user identity."""
    user = UserInfo(user_id="alice", display_name="Alice", is_admin=False)
    app.state.openbis_client.validate_token = AsyncMock(return_value=user)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/auth/me", headers={"Authorization": "Bearer valid-token"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == "alice"
    assert data["is_admin"] is False


@pytest.mark.asyncio
async def test_get_me_missing_token(app):
    """Missing Authorization header returns 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me_invalid_token(app):
    """Invalid token returns 401."""
    app.state.openbis_client.validate_token = AsyncMock(
        side_effect=AuthError("Token is invalid or expired")
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/auth/me", headers={"Authorization": "Bearer bad-token"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me_admin_user(app):
    """Admin user has is_admin=True in response."""
    admin = UserInfo(user_id="admin", display_name="Admin", is_admin=True)
    app.state.openbis_client.validate_token = AsyncMock(return_value=admin)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/auth/me", headers={"Authorization": "Bearer admin-token"})

    assert resp.status_code == 200
    assert resp.json()["is_admin"] is True
