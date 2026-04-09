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

| Method                                         | Description                                                                                                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acquire_lock(device_id, user_id) -> LockInfo` | Atomically sets `lock:{device_id}` in Redis (`SET NX EX`). Raises `LockConflictError` if already held by someone else. Returns a fresh `LockInfo` with a new `session_id`. |
| `get_lock(device_id) -> LockInfo \| None`      | Returns current lock metadata, or `None` if the device is free.                                                                                                            |
| `release_lock(device_id, session_id, user_id)` | Deletes the Redis key. Raises `LockConflictError` if `session_id` or `user_id` do not match the stored lock.                                                               |
| `renew_lock(device_id, session_id, user_id)`   | Resets the Redis TTL. Same ownership check as `release_lock`.                                                                                                              |
| `reset_all_locks()`                            | Deletes all `lock:*` keys. Called by the end-of-day scheduler job.                                                                                                         |

## Redis key format

```
lock:{device_id}   →   JSON-serialised LockInfo   (TTL = LOCK_TTL_SECONDS)
```

## Lock TTL and renewal

The TTL defaults to `LOCK_TTL_SECONDS` (configurable in `.env`). Clients are expected to call `renew_lock` before the TTL expires. If they do not (e.g. the client crashes), the lock expires automatically and the device becomes available again.
