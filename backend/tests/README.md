# `backend/tests/` — Test Suite

All tests use `pytest` with `pytest-asyncio`. No real hardware, no real Redis, and no real OpenBIS are required for the standard suite. Integration tests in `test_openbis_integration.py` optionally connect to a live OpenBIS server when the relevant CLI flags are supplied.

## Running tests

Run from `backend/` (where `pyproject.toml` lives; `testpaths = ["tests"]`).

```bash
cd backend
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
| `mock_driver`        | function | `MockOscilloscopeDriver` with a small `max_depth` (20 000) and no block delay, so full-memory reads are fast. Tests of progress/cancel raise `block_delay_s`. |
| `instrument_manager` | function | `InstrumentManager` pre-loaded with one device `scope-01` using `mock_driver`.                          |
| `buffer_service`     | function | `BufferService` pointing at `tmp_path` (pytest temporary directory, cleaned up after each test).                   |
| `app`                | function | Full FastAPI application with all worker tasks running, an `EventBus` (`app.state.event_bus`), `OpenBISClient` replaced by a mock that accepts any token (as user `alice`). |
| `async_client`       | function | `httpx.AsyncClient` bound to the test `app`. Use this for HTTP-level integration tests.                            |
| `act_as`             | function | Returns `act_as(user)` which switches the user the mocked OpenBIS client authenticates (e.g. to test 403 for a second user). |
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
| `test_locks.py`               | Lock acquisition, double-acquire conflict, TTL expiry, `renew_lock`, `soften_lock`, `reset_all_locks`.                                                                                                                                                                                                                                            |
| `test_buffer.py`              | `store_waveform`, `store_screenshot`, `list_artifacts`, `set_flag`, `export_hdf5`, `index.json` integrity. `create_commit_zip`: single-channel, multi-channel merging, annotation-based filenames, duplicate-annotation disambiguation, extra-content injection, screenshot inclusion. `_slugify` and `_unique_name` helpers. Session ownership (`register_session`, `get_session_info`, `list_sessions`), `mark_uploaded`, `get_artifacts`, shared `created_at`, legacy index defaults.      |
| `test_sessions.py`            | `GET /sessions/{id}/artifacts`, `POST .../flag`, `POST .../commit` (no artifacts, no flagged, success, multiple flagged, OSCILLOSCOPE property mapping, screenshot detection, channel/acquisition counting, dropbox mode — ZIP written to directory with embedded `dataset_metadata.json`).                                        |
| `test_mock_driver.py`         | Mock driver: CH1–CH4 signals (Vpp, frequency, 45° phase lag, square/triangle), timebase window, channel clipping/GND/disable, trigger level/slope shifting, `single`/`autoscale`, block-wise max read progress and cancellation, capability derivation, lazy re-export from `base_driver`. |
| `test_device_features.py`     | Capabilities and `channel_count`, `POST /preview` (stores nothing), acquire `include_data`/`created_at`/timebase/trigger, SSE `progress` events, `acquire/cancel` (409, nothing stored, device not in ERROR), scope commands incl. `not_supported`, soft unlock (keeps lock, reclaimable, TTL restore by heartbeat, expiry → ONLINE). |
| `test_session_features.py`    | Session ownership registered on lock, 403 for other users on every `/sessions/{id}/…` route, admin and legacy access, `GET /sessions?mine=` listing and counts, uploaded status, commit with `artifact_ids` (marks uploaded, clears persist, `openbis_url`), dropbox commit, ZIP download, `export.h5`. |
| `test_app_config.py`          | Public `GET /config`, settings defaults, `LAB_COURSES` from JSON, and that `GET /devices/events` streams (`text/event-stream`) instead of being matched by `/devices/{device_id}`. |
| `test_admin.py`               | `POST /admin/locks/reset` and `POST /admin/devices/{id}/force-unlock` — admin vs non-admin access.                                                                                                                                                                                                                                 |
| `test_openbis_integration.py` | Live integration tests for every OpenBIS call: `validate_token` (valid, invalid, caching), `create_dataset` with `OSCILLOSCOPE` type and `DATASET.*` properties, full commit via `POST /sessions/{id}/commit`, and all three `/openbis/structure/*` API routes. Skipped unless `--openbis-url` and `--openbis-token` are supplied. |

## Design principles

- **No mocking of internal logic** — tests call the real service classes; only external dependencies (Redis, OpenBIS, hardware) are replaced.
- **Async throughout** — all fixtures and test functions are `async` where needed; the `asyncio` event loop is managed by `pytest-asyncio`.
- **Isolation** — each test gets a fresh `fake_redis` and `tmp_path`, so tests cannot interfere with each other.
