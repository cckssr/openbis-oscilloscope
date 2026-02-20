import json
import time
from dataclasses import dataclass

import redis.asyncio as aioredis

from app.config import settings


@dataclass
class LockInfo:
    device_id: str
    owner_user: str
    session_id: str
    acquired_at: float
    last_seen: float


class LockService:
    def __init__(self, redis_client: aioredis.Redis) -> None:
        self._redis = redis_client

    def _key(self, device_id: str) -> str:
        return f"lock:{device_id}"

    async def acquire_lock(self, device_id: str, user_id: str, session_id: str) -> bool:
        """Atomically acquire lock via SET NX EX. Returns True if acquired."""
        key = self._key(device_id)
        now = time.time()
        payload = json.dumps({
            "owner_user": user_id,
            "session_id": session_id,
            "acquired_at": now,
            "last_seen": now,
        })
        result = await self._redis.set(key, payload, nx=True, ex=settings.LOCK_TTL_SECONDS)
        return result is not None

    async def _load(self, device_id: str) -> dict | None:
        raw = await self._redis.get(self._key(device_id))
        if raw is None:
            return None
        return json.loads(raw)

    async def release_lock(self, device_id: str, session_id: str) -> bool:
        """Release lock if caller owns it. Returns True if released."""
        d = await self._load(device_id)
        if d is None or d["session_id"] != session_id:
            return False
        await self._redis.delete(self._key(device_id))
        return True

    async def renew_lock(self, device_id: str, session_id: str) -> bool:
        """Reset TTL if caller owns the lock. Returns True if renewed."""
        d = await self._load(device_id)
        if d is None or d["session_id"] != session_id:
            return False
        d["last_seen"] = time.time()
        await self._redis.set(self._key(device_id), json.dumps(d), ex=settings.LOCK_TTL_SECONDS)
        return True

    async def get_lock(self, device_id: str) -> LockInfo | None:
        """Return current lock info or None if unlocked."""
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
        """Force-release lock regardless of owner (admin only)."""
        result = await self._redis.delete(self._key(device_id))
        return bool(result)

    async def reset_all_locks(self, pattern: str = "lock:*") -> int:
        """Delete all lock keys. Returns count of deleted keys."""
        keys = [key async for key in self._redis.scan_iter(match=pattern)]
        if not keys:
            return 0
        return await self._redis.delete(*keys)
