# `app/openbis_client/` — OpenBIS Integration

Thin wrapper around the `pybis` library. Handles token validation (with TTL caching) and dataset registration for committing flagged artifacts from a session.

## Files

### `client.py`

**`UserInfo`** — returned by `validate_token()`:

| Field          | Type   | Description                                                              |
| -------------- | ------ | ------------------------------------------------------------------------ |
| `user_id`      | `str`  | OpenBIS user identifier                                                  |
| `display_name` | `str`  | Human-readable name                                                      |
| `is_admin`     | `bool` | `True` if the user has `INSTANCE_ADMIN` or `INSTANCE`-level `ADMIN` role |

**`OpenBISClient`** — methods:

| Method                                          | Description                                                                                                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate_token(token) -> UserInfo`             | Calls `pybis.Openbis.login_with_token()` and queries the user's roles. Result is cached in a `TTLCache` for `TOKEN_CACHE_SECONDS` seconds to avoid hammering OpenBIS on every request. Raises `AuthError` on invalid tokens. |
| `register_dataset(session_id, files, metadata)` | Creates a new OpenBIS dataset and uploads the list of file paths. Raises `OpenBISError` on failure.                                                                                                                          |

## DEBUG mode

When `DEBUG=True`, `validate_token()` accepts a fixed `DEBUG_TOKEN` string (set in `.env`) and returns a synthetic admin `UserInfo` without contacting OpenBIS. This allows full API testing with no external dependencies.

## Token caching

The TTL cache size and expiry are controlled by `TOKEN_CACHE_SECONDS` (default 60 s). Increasing this reduces latency on busy setups; decreasing it makes token revocation take effect sooner.
