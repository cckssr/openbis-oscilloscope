"""API endpoints related to authentication and user information."""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user
from app.openbis_client.client import UserInfo

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=dict)
async def get_me(user: UserInfo = Depends(get_current_user)) -> dict:
    """Return identity information for the current authenticated user.

    Args:
        user: The authenticated user, injected by
            :func:`~app.core.dependencies.get_current_user`.

    Returns:
        A dict with ``user_id``, ``display_name``, and ``is_admin``.
    """
    return {
        "user_id": user.user_id,
        "display_name": user.display_name,
        "is_admin": user.is_admin,
    }
