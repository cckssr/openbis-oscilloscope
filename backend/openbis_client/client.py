"""Client module for interacting with OpenBIS via the pybis library."""

import asyncio
import logging
import threading
import uuid
from dataclasses import dataclass

import cachetools
from pybis import Openbis

from backend.config import settings
from backend.core.exceptions import AuthError, OpenBISError

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
    :attr:`~backend.config.Settings.TOKEN_CACHE_SECONDS` seconds to avoid making a
    round-trip to OpenBIS on every API request.
    """

    def __init__(self) -> None:
        """Initialize the client with an empty TTL token cache."""
        self._cache: cachetools.TTLCache = cachetools.TTLCache(
            maxsize=256, ttl=settings.TOKEN_CACHE_SECONDS
        )
        self._openbis: Openbis | None = None
        self._openbis_lock = threading.Lock()

    def _get_openbis(self) -> Openbis:
        """Return a cached unauthenticated pybis :class:`Openbis` instance.

        Reuses a single instance so repeated calls don't each open a new
        TCP/TLS session to the OpenBIS server.

        Returns:
            A :class:`pybis.Openbis` instance pointed at
            :attr:`~backend.config.Settings.OPENBIS_URL`.
        """
        with self._openbis_lock:
            if self._openbis is None:
                self._openbis = Openbis(settings.OPENBIS_URL, verify_certificates=True)
            return self._openbis

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

            def _do_validate() -> UserInfo:
                o = self._get_openbis()
                o.set_token(token, save_token=False)
                if not o.is_session_active():
                    raise AuthError("Token is invalid or expired")

                user_id = o.get_session_info().userName

                is_admin = False
                try:
                    groups = o.get_role_assignments(userId=user_id)
                    for _, row in groups.df.iterrows():
                        if row.get("role") in ("ADMIN", "INSTANCE_ADMIN") and row.get(
                            "roleLevel"
                        ) in ("INSTANCE", None):
                            is_admin = True
                            break
                except Exception:
                    logger.debug("Could not determine admin status for %s", user_id)

                return UserInfo(
                    user_id=user_id, display_name=user_id, is_admin=is_admin
                )

            info = await asyncio.to_thread(_do_validate)
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
        dataset_type: str = "OSCILLOSCOPE",
        object_id: str | None = None,
    ) -> str:
        """Register a set of files as a new OpenBIS dataset.

        Uses pybis to create the dataset, upload the provided files, and attach
        custom properties. When ``object_id`` is given the dataset is linked to
        that object; otherwise it is linked to ``experiment_id`` (collection).

        Args:
            token: A valid OpenBIS session token used to authenticate the upload.
            experiment_id: OpenBIS experiment identifier in the form
                ``"/SPACE/PROJECT/EXPERIMENT"``.
            files: List of absolute file path strings to upload.
            properties: Dict mapping OpenBIS property type codes to values
                (e.g. ``{"DATASET.DSO_EXPERIMENT": "...", "DATASET.DSO_NUM_ACQUISITIONS": 1}``).
            dataset_type: OpenBIS dataset type code. Defaults to ``"OSCILLOSCOPE"``.
            object_id: Optional OpenBIS object identifier. When provided,
                the dataset is attached to this object instead of the collection.

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

            def _do_create() -> str:
                o = self._get_openbis()
                o.set_token(token, save_token=False)
                kwargs: dict = {
                    "type": dataset_type,
                    "files": files,
                    "props": properties,
                }
                if object_id:
                    kwargs["object"] = object_id
                else:
                    kwargs["experiment"] = experiment_id
                ds = o.new_dataset(**kwargs)
                ds.save()
                return ds.permId

            return await asyncio.to_thread(_do_create)

        except Exception as exc:
            logger.error("OpenBIS dataset creation failed: %s", exc)
            raise OpenBISError(f"Dataset creation failed: {exc}") from exc


openbis_client = OpenBISClient()
