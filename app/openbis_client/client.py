import logging
from dataclasses import dataclass

import cachetools
from pybis import Openbis

from app.config import settings
from app.core.exceptions import AuthError, OpenBISError

logger = logging.getLogger(__name__)


@dataclass
class UserInfo:
    user_id: str
    display_name: str
    is_admin: bool


class OpenBISClient:
    def __init__(self) -> None:
        self._cache: cachetools.TTLCache = cachetools.TTLCache(
            maxsize=256, ttl=settings.TOKEN_CACHE_SECONDS
        )

    def _get_openbis(self) -> Openbis:
        return Openbis(settings.OPENBIS_URL, verify_certificates=False)

    async def validate_token(self, token: str) -> UserInfo:
        """Validate token against OpenBIS; caches result for TOKEN_CACHE_SECONDS."""
        if token in self._cache:
            return self._cache[token]

        try:
            o = self._get_openbis()
            # pybis login_with_token sets the token and verifies it
            o.set_token(token, save_token=False)
            if not o.is_session_active():
                raise AuthError("Token is invalid or expired")

            user_id = o.get_session_info().userName

            # Determine admin status by checking if user is in instance admin group
            is_admin = False
            try:
                groups = o.get_role_assignments(userId=user_id)
                for _, row in groups.df.iterrows():
                    if row.get("role") in ("ADMIN", "INSTANCE_ADMIN") and row.get(
                        "roleLevel"
                    ) in (
                        "INSTANCE",
                        None,
                    ):
                        is_admin = True
                        break
            except Exception:
                logger.debug("Could not determine admin status for %s", user_id)

            info = UserInfo(
                user_id=user_id,
                display_name=user_id,
                is_admin=is_admin,
            )
            self._cache[token] = info
            return info

        except AuthError:
            raise
        except Exception as exc:
            logger.error("OpenBIS token validation failed: %s", exc)
            raise AuthError(f"Token validation failed: {exc}") from exc

    async def create_dataset(
        self,
        token: str,
        experiment_id: str,
        files: list,
        properties: dict,
    ) -> str:
        """Register files as a new OpenBIS dataset. Returns permId."""
        try:
            o = self._get_openbis()
            o.set_token(token, save_token=False)

            ds = o.new_dataset(
                type="RAW_DATA",
                experiment=experiment_id,
                files=files,
                props=properties,
            )
            ds.save()
            return ds.permId

        except Exception as exc:
            logger.error("OpenBIS dataset creation failed: %s", exc)
            raise OpenBISError(f"Dataset creation failed: {exc}") from exc


openbis_client = OpenBISClient()
