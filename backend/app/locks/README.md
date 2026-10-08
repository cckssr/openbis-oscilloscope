# `app/locks/` — Distributed Lock Service

Provides exclusive, time-limited control over a single oscilloscope to one user session at a time. Locks are stored in Redis so they survive across multiple app replicas.

## Files

### `service.py`

**`LockInfo`** — metadata stored with each lock:

| Field         | Type       | Description                                                             |
| ------------- | ---------- | ----------------------------------------------------------------------- |
| `device_id`   | `str`      | Device the lock covers                                                  |
| `owner_user`  | `str`      | OpenBIS user ID of the lock holder                                      |
| `session_id`  | `str`      | UUID assigned at lock acquisition; used as a bearer for lock operations |
| `acquired_at` | `datetime` | When the lock was first acquired                                        |
| `last_seen`   | `datetime` | Updated on every `renew_lock()` call                                    |

**`LockService`** — methods:

| Method                                              | Description                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acquire_lock(device_id, user_id) -> LockInfo`      | Atomically sets `lock:{device_id}` in Redis (`SET NX EX`). Raises `LockConflictError` if already held by someone else. Returns a fresh `LockInfo` with a new `session_id`.                                                                                                            |
| `get_lock(device_id) -> LockInfo \| None`           | Returns current lock metadata, or `None` if the device is free.                                                                                                                                                                                                                       |
| `release_lock(device_id, session_id, user_id)`      | Atomically deletes the Redis key using a WATCH/MULTI/EXEC pipeline. Raises `LockConflictError` if `session_id` or `user_id` do not match; returns `False` if key was already gone. Retries automatically on `WatchError` (concurrent modification).                                   |
| `renew_lock(device_id, session_id, user_id)`        | Resets the Redis TTL using a WATCH/MULTI/EXEC pipeline. Same ownership check and retry-on-`WatchError` semantics as `release_lock`.                                                                                                                                                   |
| `soften_lock(device_id, session_id) -> int \| None` | Soft release for page unload: keeps the key but shortens its TTL to `LOCK_SOFT_RELEASE_SECONDS` (never extends a shorter TTL). Returns the remaining seconds, or `None` if the lock is missing / owned by another session. A later `renew_lock` restores the full `LOCK_TTL_SECONDS`. |
| `soften_lock(device_id, session_id) -> int \| None` | Soft release for page unload: keeps the key but shortens its TTL to `LOCK_SOFT_RELEASE_SECONDS` (never extends a shorter TTL). Returns the remaining seconds, or `None` if the lock is missing / owned by another session. A later `renew_lock` restores the full `LOCK_TTL_SECONDS`. |
| `reset_all_locks()`                                 | Deletes all `lock:*` keys. Called by the end-of-day scheduler job.                                                                                                                                                                                                                    |

## Redis key format

```
lock:{device_id}   →   JSON-serialised LockInfo   (TTL = LOCK_TTL_SECONDS)
```

## Lock TTL and renewal

The TTL defaults to `LOCK_TTL_SECONDS` (configurable in `.env`, default 300 s; the frontend heartbeats every 60 s). Clients are expected to call `renew_lock` before the TTL expires. If they do not (e.g. the client crashes), the lock expires automatically and the device becomes available again.

## Soft release and expiry

`POST /devices/{id}/unlock?soft=true` calls `soften_lock`: the lock stays (device `LOCKED`, same user can reclaim it via `GET /devices/{id}`), but lives only `LOCK_SOFT_RELEASE_SECONDS`. When a lock key expires nothing resets the in-memory device state, so the devices router calls `reconcile_expired_lock()` on every `GET /devices` and `GET /devices/{id}`: a `LOCKED` device without a Redis lock is set back to `ONLINE` (and a `lock` SSE event with `owner_user=null` is published).
