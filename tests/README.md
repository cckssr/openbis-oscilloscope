# `tests/` — Test Suite

All tests use `pytest` with `pytest-asyncio`. No real hardware, no real Redis, and no real OpenBIS are required for the standard suite. Integration tests in `test_openbis_integration.py` optionally connect to a live OpenBIS server when the relevant CLI flags are supplied.

## Running tests

```bash
pytest                          # all tests (integration tests auto-skipped)
pytest tests/test_devices.py    # single file
pytest tests/test_auth.py -k "test_me"  # single test

# Run OpenBIS integration tests against a live server:
pytest tests/test_openbis_integration.py \
    --openbis-url https://openbis.example.com \
    --openbis-token <session-token>

# Full hierarchy tests (deeper structure endpoints):
pytest tests/test_openbis_integration.py \
    --openbis-url https://openbis.example.com \
    --openbis-token <session-token> \
    --openbis-space GP_2025_WISE \
    --openbis-project DI_X_SMITH \
    --openbis-collection DI_X_SMITH_EXP_10 \
    --openbis-experiment /GP_2025_WISE/DI_X_SMITH/DI_X_SMITH_EXP_10
```

## Fixtures (`conftest.py`)

| Fixture              | Scope    | Description                                                                                                        |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `fake_redis`         | function | In-memory `fakeredis.aioredis.FakeRedis` instance. Replaces real Redis for all lock and state operations.          |
| `lock_service`       | function | `LockService` wired to `fake_redis`.                                                                               |
| `instrument_manager` | function | `InstrumentManager` pre-loaded with one device `scope-01` using `MockOscilloscopeDriver`.                          |
| `buffer_service`     | function | `BufferService` pointing at `tmp_path` (pytest temporary directory, cleaned up after each test).                   |
| `app`                | function | Full FastAPI application with all worker tasks running, `OpenBISClient` replaced by a mock that accepts any token. |
| `async_client`       | function | `httpx.AsyncClient` bound to the test `app`. Use this for HTTP-level integration tests.                            |
| `openbis_url`        | function | Value of `--openbis-url` CLI flag; skips the test if absent.                                                       |
| `openbis_token`      | function | Value of `--openbis-token` CLI flag; skips the test if absent.                                                     |
| `openbis_space`      | function | Value of `--openbis-space` CLI flag; `None` if absent (routes fall back to `settings.OPENBIS_SPACE`).              |
| `openbis_project`    | function | Value of `--openbis-project` CLI flag; skips the test if absent.                                                   |
| `openbis_collection` | function | Value of `--openbis-collection` CLI flag; skips the test if absent.                                                |
| `openbis_experiment` | function | Value of `--openbis-experiment` CLI flag; skips the test if absent.                                                |

## Test files

| File                          | What it tests                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test_auth.py`                | Token validation, `get_current_user`, `require_admin`, DEBUG token acceptance, invalid token rejection.                                                                                                                                                                                                                            |
| `test_devices.py`             | Device listing, lock acquire/release/heartbeat, state transitions, command dispatch (run, stop, acquire, screenshot, channel data).                                                                                                                                                                                                |
| `test_locks.py`               | Lock acquisition, double-acquire conflict, TTL expiry, `renew_lock`, `reset_all_locks`.                                                                                                                                                                                                                                            |
| `test_buffer.py`              | `store_waveform`, `store_screenshot`, `list_artifacts`, `set_flag`, `export_hdf5`, `index.json` integrity. `create_commit_zip`: single-channel, multi-channel merging, annotation-based filenames, duplicate-annotation disambiguation, extra-content injection, screenshot inclusion. `_slugify` and `_unique_name` helpers.      |
| `test_sessions.py`            | `GET /sessions/{id}/artifacts`, `POST .../flag`, `POST .../commit` (no artifacts, no flagged, success, multiple flagged, OSCILLOSCOPE property mapping, screenshot detection, channel/acquisition counting, dropbox mode — ZIP written to directory with embedded `dataset_metadata.json`).                                        |
| `test_admin.py`               | `POST /admin/locks/reset` and `POST /admin/devices/{id}/force-unlock` — admin vs non-admin access.                                                                                                                                                                                                                                 |
| `test_openbis_integration.py` | Live integration tests for every OpenBIS call: `validate_token` (valid, invalid, caching), `create_dataset` with `OSCILLOSCOPE` type and `DATASET.*` properties, full commit via `POST /sessions/{id}/commit`, and all three `/openbis/structure/*` API routes. Skipped unless `--openbis-url` and `--openbis-token` are supplied. |

## Design principles

- **No mocking of internal logic** — tests call the real service classes; only external dependencies (Redis, OpenBIS, hardware) are replaced.
- **Async throughout** — all fixtures and test functions are `async` where needed; the `asyncio` event loop is managed by `pytest-asyncio`.
- **Isolation** — each test gets a fresh `fake_redis` and `tmp_path`, so tests cannot interfere with each other.
