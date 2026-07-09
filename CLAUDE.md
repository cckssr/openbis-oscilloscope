# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Setup:**

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # then edit OPENBIS_URL
```

**Run (no hardware needed):**

```bash
DEBUG=True uvicorn app.main:app --reload
```

**Tests:**

```bash
pytest                          # all tests
pytest tests/test_devices.py    # single file
pytest tests/test_auth.py -k "test_me"  # single test
```

Tests use `fakeredis` and `MockOscilloscopeDriver` — no Redis or real hardware required.

**Docker:**

```bash
docker compose up
```

## Architecture

This is a **FastAPI service** that sits between lab clients and LAN-connected oscilloscopes. It stores acquired waveforms/screenshots on disk and commits flagged artifacts to OpenBIS via pybis.

**Request flow:**

```text
Client (Bearer token) → FastAPI → OpenBIS token validation (TTLCache)
                                → Redis lock check
                                → InstrumentManager.execute_command()
                                → per-device asyncio.Queue worker
                                → driver method
                                → BufferService (disk)
```

**Key design constraints:**

- All commands to a given device are **serialized** through a per-device `asyncio.Queue` worker task. Calls across different devices execute in parallel.
- Device locks are stored in Redis as `lock:{device_id}` keys with TTL. Lock ownership requires matching both `session_id` and `user_id`.
- Services are attached to `app.state` at startup and accessed in route handlers via FastAPI dependency injection (`backend/core/dependencies.py`).

**`DEBUG=True` mode** replaces Redis with `fakeredis`, uses `MockOscilloscopeDriver` for all devices, skips the health monitor, and accepts a fixed `DEBUG_TOKEN` bearer token — no external dependencies needed.

## Key files

| File                                                                     | Role                                                                    |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [backend/main.py](backend/main.py)                                       | backend factory + service startup/shutdown lifecycle                    |
| [backend/config.py](backend/config.py)                                   | Pydantic settings loaded from env / `.env`                              |
| [backend/core/dependencies.py](backend/core/dependencies.py)             | FastAPI DI: `get_current_user`, `require_admin`, `make_lock_dependency` |
| [backend/core/exceptions.py](backend/core/exceptions.py)                 | `AppError` hierarchy with HTTP status codes; global handler             |
| [backend/instruments/manager.py](backend/instruments/manager.py)         | Device lifecycle, per-device worker tasks, driver dynamic import        |
| [backend/instruments/base_driver.py](backend/instruments/base_driver.py) | Abstract driver interface + `WaveformData`, `ChannelConfig`, etc.       |
| [backend/locks/service.py](backend/locks/service.py)                     | Redis-backed exclusive locks (`SET NX EX`)                              |
| [backend/buffer/service.py](backend/buffer/service.py)                   | Disk artifact storage (CSV/PNG/HDF5) and `index.json` registry          |
| [backend/openbis_client/client.py](backend/openbis_client/client.py)     | pybis wrapper for token validation + dataset registration               |
| [config/oscilloscopes.yaml](config/oscilloscopes.yaml)                   | Device inventory (id, ip, port, driver class path)                      |
| [drivers/my_oscilloscope.py](drivers/my_oscilloscope.py)                 | Template for new hardware drivers — copy and implement TODOs            |

## Adding a hardware driver

1. Copy `drivers/my_oscilloscope.py`, implement all abstract methods from `BaseOscilloscopeDriver`.
2. The `driver` field in `oscilloscopes.yaml` is a Python dotted import path (e.g. `drivers.rigol_ds1054z.RigolDS1054Z`) — dynamically imported at startup by `InstrumentManager.instantiate_driver()`.
3. Use `driver: "mock"` in YAML to use the mock driver for a specific device.
4. No locking needed inside drivers — the instrument manager serializes all calls.

## Folder READMEs

Every package folder has a `README.md` that documents its files, public classes, and how it fits into the overall architecture:

| Folder                    | README                                                               |
| ------------------------- | -------------------------------------------------------------------- |
| `backend/`                | [backend/README.md](backend/README.md)                               |
| `backend/api/`            | [backend/api/README.md](backend/api/README.md)                       |
| `backend/core/`           | [backend/core/README.md](backend/core/README.md)                     |
| `backend/instruments/`    | [backend/instruments/README.md](backend/instruments/README.md)       |
| `backend/locks/`          | [backend/locks/README.md](backend/locks/README.md)                   |
| `backend/buffer/`         | [backend/buffer/README.md](backend/buffer/README.md)                 |
| `backend/openbis_client/` | [backend/openbis_client/README.md](backend/openbis_client/README.md) |
| `backend/scheduler/`      | [backend/scheduler/README.md](backend/scheduler/README.md)           |
| `config/`                 | [config/README.md](config/README.md)                                 |
| `drivers/`                | [drivers/README.md](drivers/README.md)                               |
| `tests/`                  | [tests/README.md](tests/README.md)                                   |
| `scripts/`                | [scripts/README.md](scripts/README.md)                               |

**Keep these READMEs in sync.** Whenever you add, remove, or significantly change a file in one of these folders — new class, renamed method, changed return type, new endpoint, new driver — update the corresponding `README.md` in the same edit session. Changes that warrant an update include:

- Adding or removing a file
- Adding, renaming, or removing a public class or function
- Changing what a method returns or what a class does
- Adding a new API endpoint or changing its path/auth/lock requirements
- Changing the on-disk layout (buffer paths, YAML schema, HDF5 structure)

## Test fixtures (conftest.py)

- `fake_redis` — in-memory Redis replacement
- `lock_service` — `LockService` backed by `fake_redis`
- `instrument_manager` — pre-wired with one `scope-01` using `MockOscilloscopeDriver`
- `buffer_service` — uses `tmp_path`
- `app` + `async_client` — full app with worker tasks running, mocked `OpenBISClient`
