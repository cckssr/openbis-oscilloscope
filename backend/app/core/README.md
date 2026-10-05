# `app/core/` — Cross-Cutting Concerns

Shared infrastructure used by every other package: dependency injection helpers, the exception hierarchy, and (via `app/config.py`) application settings.

## Files

### `dependencies.py`

FastAPI `Depends`-compatible callables injected into route handlers.

| Function                                | Returns        | Description                                                                                                                                                                                                                                                                 |
| --------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_current_user()`                    | `UserInfo`     | Extracts the `Authorization: Bearer <token>` header and validates it against OpenBIS. Falls back to the `openbis` cookie when the header is absent. Raises `AuthError` (HTTP 401) if neither is present or the token is invalid. Results are TTL-cached in `OpenBISClient`. |
| `require_admin()`                       | `UserInfo`     | Calls `get_current_user()` and raises `AdminRequiredError` (HTTP 403) unless the user holds an `INSTANCE_ADMIN` or `INSTANCE`-level `ADMIN` role in OpenBIS.                                                                                                                |
| `make_lock_dependency(device_id_param)` | `Depends(...)` | Factory that returns a dependency verifying the caller holds the active Redis lock for the requested device. Raises `LockRequiredError` or `LockConflictError` as appropriate.                                                                                              |

### `exceptions.py`

Defines the `AppError` hierarchy and the global exception handler.

| Exception               | HTTP | Meaning                                           |
| ----------------------- | ---- | ------------------------------------------------- |
| `AuthError`             | 401  | Missing or invalid Bearer token                   |
| `ForbiddenError`        | 403  | Valid user, but not allowed to perform the action |
| `AdminRequiredError`    | 403  | Endpoint requires admin role                      |
| `DeviceNotFoundError`   | 404  | `device_id` not in oscilloscopes.yaml             |
| `DeviceOfflineError`    | 503  | Device exists but is not reachable                |
| `ValidationError`       | 400  | Request is valid but semantically incorrect       |
| `LockRequiredError`     | 409  | Command needs a lock but none was acquired        |
| `LockConflictError`     | 409  | Lock is held by a different user/session          |
| `ArtifactNotFoundError` | 404  | Artifact ID not in a session's index              |
| `SessionNotFoundError`  | 404  | Session directory does not exist                  |
| `OpenBISError`          | 502  | pybis call to OpenBIS failed                      |

`register_exception_handlers(app)` installs a single FastAPI exception handler that converts any `AppError` subclass into a JSON `{"detail": "..."}` response with the matching status code.
