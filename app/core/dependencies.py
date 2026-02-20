from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import AdminRequiredError, LockRequiredError
from app.locks.service import LockInfo, LockService
from app.openbis_client.client import UserInfo, openbis_client

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UserInfo:
    from app.core.exceptions import AuthError

    if credentials is None:
        raise AuthError("Missing Authorization header")
    return await openbis_client.validate_token(credentials.credentials)


async def require_admin(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    if not user.is_admin:
        raise AdminRequiredError()
    return user


def make_lock_dependency(lock_service: LockService):
    """Factory that returns a FastAPI dependency for lock verification."""

    async def require_lock(
        device_id: str,
        session_id: str,
        user: UserInfo = Depends(get_current_user),
    ) -> LockInfo:
        lock = await lock_service.get_lock(device_id)
        if lock is None or lock.session_id != session_id or lock.owner_user != user.user_id:
            raise LockRequiredError(device_id)
        return lock

    return require_lock
