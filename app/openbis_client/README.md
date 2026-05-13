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

| Method                                                                                                        | Description                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate_token(token) -> UserInfo`                                                                           | Calls `pybis.Openbis.is_session_active()` and queries the user's roles. Result is cached in a `TTLCache` for `TOKEN_CACHE_SECONDS` seconds. Raises `AuthError` on invalid tokens.                                                                  |
| `create_dataset(token, experiment_id, files, properties, dataset_type="OSCILLOSCOPE", object_id=None) -> str` | Creates a new OpenBIS dataset. When `object_id` is given the dataset is attached to that object; othesrwise it is linked to `experiment_id` (collection path `/SPACE/PROJECT/COLLECTION`). Returns the `permId`. Raises `OpenBISError` on failure. |

## DEBUG mode

When `DEBUG=True`:

- `validate_token()` accepts the fixed `DEBUG_TOKEN` string and returns a synthetic admin `UserInfo` without contacting OpenBIS.
- `create_dataset()` skips pybis entirely and returns a simulated `permId` (`"DEBUG-<hex>"`), so the full acquire → flag → commit workflow can be tested without an OpenBIS instance.

## Token caching

The TTL cache size and expiry are controlled by `TOKEN_CACHE_SECONDS` (default 60 s). Increasing this reduces latency on busy setups; decreasing it makes token revocation take effect sooner.
