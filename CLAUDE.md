# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Setup:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # then edit OPENBIS_URL

# frontend (npm, lock file is package-lock.json)
cd ../frontend && npm ci
```

**Run (no hardware needed, from `backend/`):**

```bash
DEBUG=True uvicorn app.main:app --reload
```

**Tests (from `backend/`):**

```bash
pytest                          # all tests
pytest tests/test_devices.py    # single file
pytest tests/test_auth.py -k "test_me"  # single test
```

Tests use `fakeredis` and `MockOscilloscopeDriver` — no Redis or real hardware required.

**Frontend (from `frontend/`):**

```bash
npm run dev     # Vite dev server on :5173, proxies /api to :8000
npm run build   # outputs to dist/
```

## Repo layout

```text
<repo>/
  backend/
    pyproject.toml   # name openbis-oscilloscope-backend; hatch packages = ["app"]; testpaths = ["tests"]
    app/             # FastAPI package; app/main.py exposes `app` → app.main:app
    drivers/         # hardware drivers, imported by dotted path (drivers.X.Y)
    config/          # oscilloscopes.yaml, driver_mapping.yaml
    tests/  scripts/  .env(.example)  buffer/ (runtime, gitignored)
  frontend/          # Vite + React; npm, package-lock.json committed
  deploy/            # systemd units, nginx.conf, install.sh
  docs/  README.md  CLAUDE.md
```

The backend is always started **from `backend/`**: `./config/…` and `./buffer` defaults, `.env`, and the `drivers.*` import paths are all relative to that directory.

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
- Services are attached to `app.state` at startup and accessed in route handlers via FastAPI dependency injection (`backend/app/core/dependencies.py`).

**`DEBUG=True` mode** replaces Redis with `fakeredis`, uses `MockOscilloscopeDriver` for all devices, skips the health monitor, and accepts a fixed `DEBUG_TOKEN` bearer token — no external dependencies needed.

## Key files

| File                                                                                           | Role                                                                    |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [backend/app/main.py](backend/app/main.py)                                                     | backend factory + service startup/shutdown lifecycle                    |
| [backend/app/config.py](backend/app/config.py)                                                 | Pydantic settings loaded from env / `.env`                              |
| [backend/app/core/dependencies.py](backend/app/core/dependencies.py)                           | FastAPI DI: `get_current_user`, `require_admin`, `make_lock_dependency` |
| [backend/app/core/exceptions.py](backend/app/core/exceptions.py)                               | `AppError` hierarchy with HTTP status codes; global handler             |
| [backend/app/instruments/manager.py](backend/app/instruments/manager.py)                       | Device lifecycle, per-device worker tasks, driver dynamic import        |
| [backend/app/instruments/base_driver.py](backend/app/instruments/base_driver.py)               | Abstract driver interface + `WaveformData`, `ChannelConfig`, etc.       |
| [backend/app/locks/service.py](backend/app/locks/service.py)                                   | Redis-backed exclusive locks (`SET NX EX`)                              |
| [backend/app/buffer/service.py](backend/app/buffer/service.py)                                 | Disk artifact storage (CSV/PNG/HDF5) and `index.json` registry          |
| [backend/app/openbis_client/client.py](backend/app/openbis_client/client.py)                   | pybis wrapper for token validation + dataset registration               |
| [backend/config/oscilloscopes.yaml](backend/config/oscilloscopes.yaml)                         | Device inventory (id, ip, port, driver class path)                      |
| [backend/drivers/_templates/my_oscilloscope.py](backend/drivers/_templates/my_oscilloscope.py) | Template for new hardware drivers — copy and implement TODOs            |

## Adding a hardware driver

1. Copy `backend/drivers/_templates/my_oscilloscope.py`, implement all abstract methods from `BaseOscilloscopeDriver`.
2. The `driver` field in `oscilloscopes.yaml` is a Python dotted import path (e.g. `drivers.rigol_ds1054z.RigolDS1054Z`) — dynamically imported at startup by `InstrumentManager.instantiate_driver()`.
3. Use `driver: "mock"` in YAML to use the mock driver for a specific device.
4. No locking needed inside drivers — the instrument manager serializes all calls.

## Folder READMEs

Every package folder has a `README.md` that documents its files, public classes, and how it fits into the overall architecture:

| Folder                        | README                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `backend/app/`                | [backend/app/README.md](backend/app/README.md)                               |
| `backend/app/api/`            | [backend/app/api/README.md](backend/app/api/README.md)                       |
| `backend/app/core/`           | [backend/app/core/README.md](backend/app/core/README.md)                     |
| `backend/app/instruments/`    | [backend/app/instruments/README.md](backend/app/instruments/README.md)       |
| `backend/app/locks/`          | [backend/app/locks/README.md](backend/app/locks/README.md)                   |
| `backend/app/buffer/`         | [backend/app/buffer/README.md](backend/app/buffer/README.md)                 |
| `backend/app/openbis_client/` | [backend/app/openbis_client/README.md](backend/app/openbis_client/README.md) |
| `backend/app/scheduler/`      | [backend/app/scheduler/README.md](backend/app/scheduler/README.md)           |
| `backend/config/`             | [backend/config/README.md](backend/config/README.md)                         |
| `backend/drivers/`            | [backend/drivers/README.md](backend/drivers/README.md)                       |
| `backend/tests/`              | [backend/tests/README.md](backend/tests/README.md)                           |
| `backend/scripts/`            | [backend/scripts/README.md](backend/scripts/README.md)                       |
| `frontend/`                   | [frontend/README.md](frontend/README.md)                                     |
| `deploy/`                     | [deploy/README.md](deploy/README.md)                                         |

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
