"""Access control for ``/sessions/{session_id}/...`` routes."""

from fastapi import Depends, Request

from app.core.dependencies import get_current_user
from app.core.exceptions import ForbiddenError
from app.openbis_client.client import UserInfo


async def require_session_access(
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> UserInfo:
    """Allow only the session owner and admins to touch a session.

    The owner is recorded when the device lock is acquired. Sessions without an
    owner (created before ownership was recorded) and sessions that do not exist
    stay accessible, so legacy data keeps working and unknown sessions keep
    returning their usual 404 / empty responses.

    Args:
        session_id: Path parameter; the control session UUID.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        The authenticated user (so routes can use this as their user dependency).

    Raises:
        ForbiddenError: HTTP 403 ``forbidden`` if the session has an owner who is
            neither the caller nor is the caller an admin.
    """
    info = request.app.state.buffer_service.get_session_info(session_id)
    if (
        info is not None
        and info.owner_user
        and info.owner_user != user.user_id
        and not user.is_admin
    ):
        raise ForbiddenError("This session belongs to another user")
    return user
