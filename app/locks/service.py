"""Service layer for managing distributed locks on devices using Redis."""

import json
import time
from dataclasses import dataclass

import redis.asyncio as aioredis

from app.config import settings


@dataclass
class LockInfo:
    """Snapshot of a device lock stored in Redis.

    Attributes:
        device_id: Identifier of the locked device.
        owner_user: User ID of the person who acquired the lock.
        session_id: UUID of the control session that holds the lock.
        acquired_at: Unix timestamp (float) when the lock was first acquired.
        last_seen: Unix timestamp (float) of the most recent heartbeat.
    """

    device_id: str
    owner_user: str
    session_id: str
    acquired_at: float
    last_seen: float


class LockService:
    """Distributed, exclusive device-locking service backed by Redis.

    Each lock is stored at the key ``lock:{device_id}`` as a JSON string with a
    TTL of :attr:`~app.config.Settings.LOCK_TTL_SECONDS`. Locks are acquired
    atomically with ``SET NX EX`` so that only one session can hold a lock at a
    time. If a client disappears without calling :meth:`release_lock`, the key
    expires automatically.
    """

    def __init__(self, redis_client: aioredis.Redis) -> None:
        """Initialize LockService.

        Args:
            redis_client: An async Redis client instance to use for all operations.
        """
        self._redis = redis_client

    def _key(self, device_id: str) -> str:
        """Build the Redis key for a device lock.

        Args:
            device_id: The device identifier.

        Returns:
            The Redis key string in the form ``lock:{device_id}``.
        """
        return f"lock:{device_id}"

    async def acquire_lock(self, device_id: str, user_id: str, session_id: str) -> bool:
        """Atomically acquire an exclusive lock on a device.

        Uses Redis ``SET NX EX`` so the operation succeeds only when no lock
        exists for the given device. The lock is stored with a TTL of
        :attr:`~app.config.Settings.LOCK_TTL_SECONDS`.

        Args:
            device_id: Identifier of the device to lock.
            user_id: User ID of the caller acquiring the lock.
            session_id: UUID that uniquely identifies this control session.

        Returns:
            ``True`` if the lock was acquired, ``False`` if the device is
            already locked by another session.
        """
        key = self._key(device_id)
        now = time.time()
        payload = json.dumps(
            {
                "owner_user": user_id,
                "session_id": session_id,
                "acquired_at": now,
                "last_seen": now,
            }
        )
        result = await self._redis.set(
            key, payload, nx=True, ex=settings.LOCK_TTL_SECONDS
        )
        return result is not None

    async def _load(self, device_id: str) -> dict | None:
        """Load and deserialize the raw lock payload from Redis.

        Args:
            device_id: Identifier of the device whose lock should be loaded.

        Returns:
            A dict with the lock fields, or ``None`` if no lock exists.
        """
        raw = await self._redis.get(self._key(device_id))
        if raw is None:
            return None
        return json.loads(raw)

    async def release_lock(self, device_id: str, session_id: str) -> bool:
        """Release the lock if the caller's session owns it.

        Args:
            device_id: Identifier of the device to unlock.
            session_id: Session UUID that must match the stored lock's session.

        Returns:
            ``True`` if the lock was deleted, ``False`` if no lock exists or
            the session ID does not match (i.e. the caller does not own the lock).
        """
        d = await self._load(device_id)
        if d is None or d["session_id"] != session_id:
            return False
        await self._redis.delete(self._key(device_id))
        return True

    async def renew_lock(self, device_id: str, session_id: str) -> bool:
        """Reset the lock TTL and update the ``last_seen`` timestamp.

        Clients should call this periodically (heartbeat) to prevent the lock
        from expiring while they are still actively using the device.

        Args:
            device_id: Identifier of the device whose lock should be renewed.
            session_id: Session UUID that must match the stored lock's session.

        Returns:
            ``True`` if the TTL was reset, ``False`` if the lock does not exist
            or the session ID does not match.
        """
        d = await self._load(device_id)
        if d is None or d["session_id"] != session_id:
            return False
        d["last_seen"] = time.time()
        await self._redis.set(
            self._key(device_id), json.dumps(d), ex=settings.LOCK_TTL_SECONDS
        )
        return True

    async def get_lock(self, device_id: str) -> LockInfo | None:
        """Return the current lock information for a device.

        Args:
            device_id: Identifier of the device to query.

        Returns:
            A :class:`LockInfo` instance if the device is locked, or ``None``
            if it is currently unlocked (or the lock has expired).
        """
        d = await self._load(device_id)
        if d is None:
            return None
        return LockInfo(
            device_id=device_id,
            owner_user=d["owner_user"],
            session_id=d["session_id"],
            acquired_at=float(d["acquired_at"]),
            last_seen=float(d["last_seen"]),
        )

    async def force_release_lock(self, device_id: str) -> bool:
        """Delete a device lock regardless of who owns it.

        Intended for admin use only. Does not verify session ownership.

        Args:
            device_id: Identifier of the device to forcibly unlock.

        Returns:
            ``True`` if a lock key was deleted, ``False`` if none existed.
        """
        result = await self._redis.delete(self._key(device_id))
        return bool(result)

    async def reset_all_locks(self, pattern: str = "lock:*") -> int:
        """Delete all lock keys matching a pattern.

        Used by the end-of-day scheduler and the admin reset endpoint to clear
        all outstanding locks at once.

        Args:
            pattern: Redis glob pattern to match lock keys.
                Defaults to ``"lock:*"`` which matches every device lock.

        Returns:
            The number of keys that were deleted.
        """
        keys = [key async for key in self._redis.scan_iter(match=pattern)]
        if not keys:
            return 0
        return await self._redis.delete(*keys)
