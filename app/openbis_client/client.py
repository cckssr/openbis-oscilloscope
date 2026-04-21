"""Client module for interacting with OpenBIS via the pybis library."""

import logging
import uuid
from dataclasses import dataclass

import cachetools
from pybis import Openbis

from app.config import settings
from app.core.exceptions import AuthError, OpenBISError

logger = logging.getLogger(__name__)


@dataclass
class UserInfo:
    """Identity information for an authenticated OpenBIS user.

    Attributes:
        user_id: The OpenBIS username (e.g. ``"jdoe"``).
        display_name: Human-readable name shown in the UI (currently equal to
            ``user_id`` as pybis does not expose a separate display name).
        is_admin: ``True`` if the user holds the ``ADMIN`` or ``INSTANCE_ADMIN``
            role at the ``INSTANCE`` level in OpenBIS.
    """

    user_id: str
    display_name: str
    is_admin: bool


class OpenBISClient:
    """Thin wrapper around the pybis library for token validation and dataset registration.

    Token validation results are cached in a :class:`cachetools.TTLCache` for
    :attr:`~app.config.Settings.TOKEN_CACHE_SECONDS` seconds to avoid making a
    round-trip to OpenBIS on every API request.
    """

    def __init__(self) -> None:
        """Initialize the client with an empty TTL token cache."""
        self._cache: cachetools.TTLCache = cachetools.TTLCache(
            maxsize=256, ttl=settings.TOKEN_CACHE_SECONDS
        )

    def _get_openbis(self) -> Openbis:
        """Create and return a new unauthenticated pybis :class:`Openbis` instance.

        Returns:
            A :class:`pybis.Openbis` instance pointed at
            :attr:`~app.config.Settings.OPENBIS_URL`.
        """
        return Openbis(settings.OPENBIS_URL, verify_certificates=True)

    async def validate_token(self, token: str) -> UserInfo:
        """Validate an OpenBIS session token and return the authenticated user.

        If the token is present in the cache, the cached :class:`UserInfo` is
        returned immediately without contacting OpenBIS. Otherwise, pybis is
        used to verify the session, resolve the username, and determine admin
        status. Successful results are stored in the cache.

        Admin status is determined by checking whether the user has the
        ``ADMIN`` or ``INSTANCE_ADMIN`` role at the ``INSTANCE`` level.
        Failure to retrieve role assignments is tolerated (admin defaults to
        ``False``).

        Args:
            token: The raw Bearer token from the ``Authorization`` header.

        Returns:
            A :class:`UserInfo` dataclass with the user's ID, display name,
            and admin flag.

        Raises:
            AuthError: If the token is invalid, expired, or the OpenBIS session
                is not active. Also raised if the pybis call itself fails.
        """
        if settings.DEBUG and token == settings.DEBUG_TOKEN:
            return UserInfo(
                user_id="debug-user", display_name="Debug User", is_admin=True
            )

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
        """Register a set of files as a new OpenBIS ``RAW_DATA`` dataset.

        Uses pybis to create the dataset, upload the provided files, and attach
        custom properties. The dataset is linked to the specified experiment.

        Args:
            token: A valid OpenBIS session token used to authenticate the upload.
            experiment_id: OpenBIS experiment identifier in the form
                ``"/SPACE/PROJECT/EXPERIMENT"``.
            files: List of absolute file path strings to upload.
            properties: Dict of custom property key-value pairs to attach to the
                dataset (e.g. ``{"session_id": "...", "artifact_count": "3"}``).

        Returns:
            The OpenBIS permanent identifier (``permId``) of the created dataset.

        Raises:
            OpenBISError: If the pybis call fails for any reason.
        """
        if settings.DEBUG:
            fake_id = f"DEBUG-{uuid.uuid4().hex[:12].upper()}"
            logger.info("DEBUG mode: simulating OpenBIS dataset creation → %s", fake_id)
            return fake_id

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
