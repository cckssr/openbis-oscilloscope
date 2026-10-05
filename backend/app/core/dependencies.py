"""Core dependencies for FastAPI routes, including authentication and lock verification."""

from fastapi import Cookie, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import AdminRequiredError, LockRequiredError, AuthError
from app.locks.service import LockInfo
from app.openbis_client.client import UserInfo

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    openbis: str | None = Cookie(default=None),
) -> UserInfo:
    """Extract and validate the Bearer token from the request, returning the authenticated user.

    Checks the ``Authorization: Bearer <token>`` header first; falls back to
    the ``openbis`` cookie (set by the OpenBIS web UI on the same domain) when
    the header is absent. The result is cached by the client for
    ``TOKEN_CACHE_SECONDS`` to avoid repeated round-trips.

    Args:
        request: The incoming HTTP request, used to access ``app.state.openbis_client``.
        credentials: HTTP Bearer credentials extracted by FastAPI's security scheme,
            or ``None`` when the header is absent.
        openbis: Value of the ``openbis`` cookie, used as a fallback token.

    Returns:
        A :class:`~app.openbis_client.client.UserInfo` dataclass with the
        authenticated user's ID, display name, and admin flag.

    Raises:
        AuthError: If neither the header nor the cookie is present, or the token
            is rejected by OpenBIS.
    """
    token = credentials.credentials if credentials else openbis
    if not token:
        raise AuthError("Missing Authorization header")
    return await request.app.state.openbis_client.validate_token(token)


async def require_admin(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """Dependency that enforces admin privileges for a route.

    Wraps :func:`get_current_user` and additionally checks the ``is_admin`` flag
    on the returned :class:`~app.openbis_client.client.UserInfo`.

    Args:
        user: The authenticated user, injected via :func:`get_current_user`.

    Returns:
        The same :class:`~app.openbis_client.client.UserInfo` object if the user
        has admin privileges.

    Raises:
        AdminRequiredError: If the authenticated user is not an admin.
    """
    if not user.is_admin:
        raise AdminRequiredError()
    return user


def make_lock_dependency(lock_service):
    """Factory that creates a FastAPI dependency verifying device lock ownership.

    Returns an async dependency function suitable for use with ``Depends()``.
    When injected into a route, it checks that the caller currently holds the
    lock on the requested device and that both the ``session_id`` and user ID
    match the stored lock record.

    Args:
        lock_service: The :class:`~app.locks.service.LockService` instance used
            to look up the current lock.

    Returns:
        An async dependency callable that accepts ``device_id``, ``session_id``,
        and ``user`` and returns the current :class:`~app.locks.service.LockInfo`
        when ownership is verified.
    """

    async def require_lock(
        device_id: str,
        session_id: str,
        user: UserInfo = Depends(get_current_user),
    ) -> LockInfo:
        """Verify that the authenticated user holds the lock for the requested device.

        Args:
            device_id: The device identifier extracted from the URL path.
            session_id: The control session UUID supplied by the caller.
            user: The authenticated user, injected via :func:`get_current_user`.

        Returns:
            The :class:`~app.locks.service.LockInfo` for the device if ownership
            is confirmed.

        Raises:
            LockRequiredError: If no lock exists, the session ID does not match,
                or the lock belongs to a different user.
        """
        lock = await lock_service.get_lock(device_id)
        if (
            lock is None
            or lock.session_id != session_id
            or lock.owner_user != user.user_id
        ):
            raise LockRequiredError(device_id)
        return lock

    return require_lock
