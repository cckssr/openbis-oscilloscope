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
        """Atomically acquire lock. Returns True if acquired, False if already held."""
        key = self._key(device_id)
        now = time.time()

        # Use a Lua script for atomic HSETNX-style acquisition
        script = """
        local key = KEYS[1]
        local ttl = tonumber(ARGV[1])
        local owner_user = ARGV[2]
        local session_id = ARGV[3]
        local now = ARGV[4]

        if redis.call('EXISTS', key) == 1 then
            return 0
        end

        redis.call('HSET', key,
            'owner_user', owner_user,
            'session_id', session_id,
            'acquired_at', now,
            'last_seen', now
        )
        redis.call('EXPIRE', key, ttl)
        return 1
        """
        result = await self._redis.eval(
            script, 1, key, settings.LOCK_TTL_SECONDS, user_id, session_id, str(now)
        )
        return bool(result)

    async def release_lock(self, device_id: str, session_id: str) -> bool:
        """Release lock if caller owns it. Returns True if released."""
        key = self._key(device_id)
        stored_session = await self._redis.hget(key, "session_id")
        if stored_session is None:
            return False
        if stored_session.decode() != session_id:
            return False
        await self._redis.delete(key)
        return True

    async def renew_lock(self, device_id: str, session_id: str) -> bool:
        """Reset TTL if caller owns the lock. Returns True if renewed."""
        key = self._key(device_id)
        stored_session = await self._redis.hget(key, "session_id")
        if stored_session is None:
            return False
        if stored_session.decode() != session_id:
            return False
        now = str(time.time())
        await self._redis.hset(key, "last_seen", now)
        await self._redis.expire(key, settings.LOCK_TTL_SECONDS)
        return True

    async def get_lock(self, device_id: str) -> LockInfo | None:
        """Return current lock info or None if unlocked."""
        key = self._key(device_id)
        data = await self._redis.hgetall(key)
        if not data:
            return None
        return LockInfo(
            device_id=device_id,
            owner_user=data[b"owner_user"].decode(),
            session_id=data[b"session_id"].decode(),
            acquired_at=float(data[b"acquired_at"]),
            last_seen=float(data[b"last_seen"]),
        )

    async def force_release_lock(self, device_id: str) -> bool:
        """Force-release lock regardless of owner (admin only). Returns True if a lock existed."""
        key = self._key(device_id)
        result = await self._redis.delete(key)
        return bool(result)

    async def reset_all_locks(self, pattern: str = "lock:*") -> int:
        """Delete all lock keys. Returns count of deleted keys."""
        keys = []
        async for key in self._redis.scan_iter(match=pattern):
            keys.append(key)
        if not keys:
            return 0
        return await self._redis.delete(*keys)
