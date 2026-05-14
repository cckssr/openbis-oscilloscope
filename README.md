# OpenBIS Oscilloscope Control Service

A three-part system for remotely controlling LAN-connected oscilloscopes from a browser. A **Vite web UI** talks to a **FastAPI backend** (oscilloscope control, locking, buffering) which in turn connects to an external **OpenBIS server** for authentication and dataset archiving.
A three-part system for remotely controlling LAN-connected oscilloscopes from a browser. A **Vite web UI** talks to a **FastAPI backend** (oscilloscope control, locking, buffering) which in turn connects to an external **OpenBIS server** for authentication and dataset archiving.

## Features

- **Multi-device, multi-user**: concurrent access to multiple oscilloscopes with exclusive locking
- **Bearer token auth**: OpenBIS session tokens are validated and cached
- **Per-device command queues**: serial execution per instrument, parallel across instruments
- **Background health monitoring**: TCP reachability checks with automatic driver reconnection
- **Artifact buffering**: waveforms stored as CSV, screenshots as PNG, with persist flags
- **OpenBIS commit**: flagged artifacts registered as datasets via pybis
- **HDF5 export**: optional bundle with a self-contained unpack script
- **Nightly OpenBIS sync**: cron job at 23:55 queries OpenBIS EQUIPMENT objects and auto-updates the oscilloscope inventory
- **End-of-day lock reset**: cron job clears all locks at 23:59 Europe/Berlin
- **Admin endpoints**: force-unlock and bulk lock reset
- **Mock driver**: full dev/test mode without real hardware (`DEBUG=True`)

## Architecture

```
Browser
  │
  ▼
Nginx (:80)  ─── /        → Vite UI (static files)
             └── /api/    → FastAPI (:8000)
                                │
                                ├── Redis (locks + TTL)
                                ├── InstrumentManager
                                │     └── per-device asyncio.Queue worker
                                ├── HealthMonitor (background TCP check)
                                ├── BufferService (CSV / PNG / HDF5 on disk)
                                └── OpenBISClient (pybis + TTLCache)
                                          │
                                          ▼
                                   OpenBIS server (external)
                                   token validation + dataset archiving
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full component breakdown, deployment guide, and API documentation reference.

## Quick start (Docker)

```bash
cp .env.example .env
# edit .env: set OPENBIS_URL, optionally DEBUG=True for mock mode

docker compose up
```

The UI is available at `http://localhost:80`.
Interactive API docs: `http://localhost:8000/docs` (also accessible via Nginx at `http://localhost/api/docs`).

## Development setup

```bash
# Terminal 1 — FastAPI backend (mock hardware, no Redis or OpenBIS needed)
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
DEBUG=True uvicorn app.main:app --reload

# Terminal 2 — Vite frontend (proxies /api/ to FastAPI automatically)
cd openbis_webapp && pnpm install && pnpm dev
```

## Running tests

```bash
pytest
```

Tests use `fakeredis` and the mock driver — no Redis or hardware required.

## Configuration

All settings are read from environment variables (or a `.env` file):

| Variable                        | Default                        | Description                                                       |
| ------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `REDIS_URL`                     | `redis://localhost:6379`       | Redis connection URL                                              |
| `OPENBIS_URL`                   | _(required)_                   | OpenBIS server URL                                                |
| `BUFFER_DIR`                    | `./buffer`                     | Root directory for artifact storage                               |
| `OSCILLOSCOPES_CONFIG`          | `./config/oscilloscopes.yaml`  | Device list                                                       |
| `LOCK_TTL_SECONDS`              | `1800`                         | Lock expiry (seconds)                                             |
| `HEALTH_CHECK_INTERVAL_SECONDS` | `5`                            | TCP health check interval                                         |
| `TOKEN_CACHE_SECONDS`           | `60`                           | Token validation cache TTL                                        |
| `EOD_RESET_TIMEZONE`            | `Europe/Berlin`                | Timezone for end-of-day reset                                     |
| `DEBUG`                         | `False`                        | Mock driver + fakeredis; bypass OpenBIS auth/commit               |
| `DEBUG_TOKEN`                   | `debug-token`                  | Bearer token accepted in `DEBUG` mode                             |
| `OPENBIS_BOT_USER`              | _(empty)_                      | Bot account for nightly sync; leave blank to disable              |
| `OPENBIS_BOT_PASSWORD`          | _(empty)_                      | Password for `OPENBIS_BOT_USER`                                   |
| `DRIVER_MAPPING_CONFIG`         | `./config/driver_mapping.yaml` | Maps `EQUIPMENT.ALTERNATIV_NAME` → driver/port                    |
| `OPENBIS_EQUIPMENT_IP_FILTER`   | `141.23.109.*`                 | IP filter for OpenBIS EQUIPMENT queries                           |
| `OPENBIS_USE_DROPBOX`           | `False`                        | Copy ZIP to `OPENBIS_DROPBOX_PATH` instead of uploading via pybis |
| `OPENBIS_DROPBOX_PATH`          | _(empty)_                      | Directory watched by the OpenBIS dropbox ingestion script         |

## Registering oscilloscopes

Edit `config/oscilloscopes.yaml`:

```yaml
oscilloscopes:
  # Rigol DS1000Z series (DS1054Z, DS1074Z, DS1104Z, …)
  - id: "rigol-01"
  # Rigol DS1000Z series (DS1054Z, DS1074Z, DS1104Z, …)
  - id: "rigol-01"
    ip: "192.168.1.100"
    port: 5025
    label: "Rigol DS1054Z"
    driver: "drivers.RigolDS1000.RigolDS1000"

  # Mock device — no hardware required (always active in DEBUG=True mode)
  - id: "scope-01"
    ip: "127.0.0.1"
    port: 5025
    label: "Mock Scope"
    driver: "mock"
    label: "Rigol DS1054Z"
    driver: "drivers.RigolDS1000.RigolDS1000"

  # Mock device — no hardware required (always active in DEBUG=True mode)
  - id: "scope-01"
    ip: "127.0.0.1"
    port: 5025
    label: "Mock Scope"
    driver: "mock"
```

Set `driver: "mock"` to use the built-in mock driver for a specific device regardless of `DEBUG` mode.
Set `driver: "mock"` to use the built-in mock driver for a specific device regardless of `DEBUG` mode.

## Adding a real oscilloscope driver

1. Copy `drivers/my_oscilloscope.py` and implement the `TODO` methods
2. Register it in `config/oscilloscopes.yaml`

See [`drivers/README.md`](drivers/README.md) for detailed instructions.

## API overview

| Method | Path                                  | Description                                   |
| ------ | ------------------------------------- | --------------------------------------------- |
| `GET`  | `/auth/me`                            | Current user identity                         |
| `GET`  | `/devices`                            | List all devices                              |
| `GET`  | `/devices/{id}`                       | Device detail + capabilities                  |
| `POST` | `/devices/{id}/lock`                  | Acquire exclusive lock → `control_session_id` |
| `POST` | `/devices/{id}/unlock`                | Release lock                                  |
| `POST` | `/devices/{id}/heartbeat`             | Renew lock TTL                                |
| `POST` | `/devices/{id}/run`                   | Start acquisition (requires lock)             |
| `POST` | `/devices/{id}/stop`                  | Stop acquisition (requires lock)              |
| `POST` | `/devices/{id}/acquire`               | Capture all enabled channels + screenshot     |
| `GET`  | `/devices/{id}/channels/{ch}/data`    | Latest waveform for channel as JSON           |
| `GET`  | `/devices/{id}/screenshot`            | Latest screenshot as `image/png`              |
| `GET`  | `/sessions/{id}/artifacts`            | List artifacts with persist flags             |
| `POST` | `/sessions/{id}/artifacts/{art}/flag` | Set `persist=true/false`                      |
| `POST` | `/sessions/{id}/commit`               | Register flagged artifacts in OpenBIS         |
| `POST` | `/admin/locks/reset`                  | Clear all locks (admin)                       |
| `POST` | `/admin/devices/{id}/force-unlock`    | Force-release one lock (admin)                |

## Buffer layout

```shell
buffer/
└── {device_id}/
    └── {session_id}/
        ├── trace_0001_ch1.csv       # time_s, voltage_V + metadata header
        ├── trace_0001_meta.json     # instrument settings snapshot
        ├── screenshot_0002.png
        ├── session.json
        └── index.json               # artifact registry with persist flags
```

CSV files have two comment lines at the top with device, channel, timing, and unit metadata — they can be opened directly in Excel or parsed with any CSV reader by skipping `#` lines.

## HDF5 export

After committing, an HDF5 bundle can be generated:

```python
# Via the buffer service directly
h5_path = buffer_service.export_hdf5(session_id, artifact_ids)
```

The bundle includes a standalone `unpack_hdf5.py` script for collaborators who only have `h5py` available.

## License

See [LICENSE](LICENSE).
