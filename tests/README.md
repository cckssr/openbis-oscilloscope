# `tests/` — Test Suite

All tests use `pytest` with `pytest-asyncio`. No real hardware, no real Redis, and no real OpenBIS are required.

## Running tests

```bash
pytest                          # all tests
pytest tests/test_devices.py    # single file
pytest tests/test_auth.py -k "test_me"  # single test
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

## Test files

| File              | What it tests                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `test_auth.py`    | Token validation, `get_current_user`, `require_admin`, DEBUG token acceptance, invalid token rejection.                                 |
| `test_devices.py` | Device listing, lock acquire/release, state transitions (OFFLINE → ONLINE → LOCKED), command dispatch (run, stop, acquire, screenshot). |
| `test_locks.py`   | Lock acquisition, double-acquire conflict, TTL expiry, `renew_lock`, `reset_all_locks`.                                                 |
| `test_buffer.py`  | `store_waveform`, `store_screenshot`, `list_artifacts`, `flag_artifact`, `export_hdf5`, `index.json` integrity.                         |

## Design principles

- **No mocking of internal logic** — tests call the real service classes; only external dependencies (Redis, OpenBIS, hardware) are replaced.
- **Async throughout** — all fixtures and test functions are `async` where needed; the `asyncio` event loop is managed by `pytest-asyncio`.
- **Isolation** — each test gets a fresh `fake_redis` and `tmp_path`, so tests cannot interfere with each other.
