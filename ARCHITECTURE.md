# Architecture & Developer Documentation

## Overview

**OpenBIS Oscilloscope Control Service** is a FastAPI-based REST API that sits between lab clients and LAN-connected oscilloscopes. It provides:

- Multi-user, multi-device access to oscilloscopes over the network
- Bearer token authentication backed by OpenBIS sessions
- Exclusive device locking via Redis (with TTL heartbeats)
- On-disk buffering of waveform data (CSV) and screenshots (PNG)
- Integration with OpenBIS for registering acquisitions as datasets
- Background health monitoring and automatic driver reconnection
- A daily scheduled lock reset

---

## Directory Structure

```text
openbis-oscilloscope/
├── app/                        # Main application package
│   ├── main.py                 # App factory + startup/shutdown lifecycle
│   ├── config.py               # Environment-based settings (Pydantic)
│   ├── api/                    # HTTP route handlers
│   │   ├── auth.py             # GET /auth/me
│   │   ├── devices.py          # Device control endpoints
│   │   ├── sessions.py         # Session/artifact management
│   │   └── admin.py            # Admin-only operations
│   ├── core/                   # Shared utilities
│   │   ├── exceptions.py       # Custom exception classes + FastAPI handler
│   │   └── dependencies.py     # FastAPI dependency injection (auth, lock check)
│   ├── instruments/            # Oscilloscope driver layer
│   │   ├── base_driver.py      # Abstract driver interface + data classes
│   │   ├── manager.py          # Device lifecycle + per-device command queues
│   │   ├── health_monitor.py   # Background TCP reachability checks
│   │   └── mock_driver.py      # Synthetic driver (sine waves) for development
│   ├── locks/
│   │   └── service.py          # Redis-backed exclusive locks with TTL
│   ├── buffer/
│   │   └── service.py          # Disk-based artifact storage (CSV / PNG / HDF5)
│   ├── openbis_client/
│   │   └── client.py           # Token validation + dataset registration via pybis
│   └── scheduler/
│       └── tasks.py            # APScheduler cron job (end-of-day lock reset)
├── drivers/
│   └── my_oscilloscope.py      # Template for implementing a real hardware driver
├── scripts/
│   └── unpack_hdf5.py          # Standalone script bundled into HDF5 exports
├── tests/                      # Pytest test suite
├── config/
│   └── oscilloscopes.yaml      # Device inventory (id, ip, port, driver class)
├── .env.example                # All supported environment variables
├── docker-compose.yml          # Redis + FastAPI container setup
└── Dockerfile
```

---

## Component Breakdown

### `app/main.py` — App Factory & Lifecycle

The entry point. `create_app()` builds the FastAPI instance and registers a `lifespan` context manager that orchestrates the startup and shutdown of every background service.

**Startup order:**

1. Connect to Redis
2. Start `LockService`
3. Start `InstrumentManager` (loads device config, spawns worker tasks)
4. Start `BufferService`
5. Start `OpenBISClient`
6. Start `HealthMonitor` (skipped in `DEBUG` mode)
7. Start `Scheduler` (end-of-day cron)

**Shutdown** tears down these in reverse, draining queues and disconnecting drivers cleanly.

Routes are registered from `app/api/` under their respective prefixes (`/auth`, `/devices`, `/sessions`, `/admin`). A simple `/health` endpoint is also added directly.

---

### `app/config.py` — Settings

Uses `pydantic-settings` to load configuration from environment variables (or a `.env` file). All settings have documented defaults.

| Variable                        | Default                       | Purpose                                        |
| ------------------------------- | ----------------------------- | ---------------------------------------------- |
| `REDIS_URL`                     | `redis://localhost:6379`      | Redis for distributed locks                    |
| `OPENBIS_URL`                   | _(required)_                  | OpenBIS server base URL                        |
| `BUFFER_DIR`                    | `./buffer`                    | Root directory for stored artifacts            |
| `OSCILLOSCOPES_CONFIG`          | `./config/oscilloscopes.yaml` | Device inventory file                          |
| `LOCK_TTL_SECONDS`              | `1800`                        | Lock expires after 30 min without heartbeat    |
| `HEALTH_CHECK_INTERVAL_SECONDS` | `5`                           | How often to TCP-check each device             |
| `TOKEN_CACHE_SECONDS`           | `60`                          | How long to cache a validated OpenBIS token    |
| `EOD_RESET_TIMEZONE`            | `Europe/Berlin`               | Timezone for the 23:59 daily lock reset        |
| `DEBUG`                         | `False`                       | If `True`, use the mock driver for all devices |

---

### `app/core/exceptions.py` — Error Handling

Defines a hierarchy of typed exceptions, all subclassing `AppError`. Each carries an HTTP status code and a machine-readable `error_code` string.

| Exception               | Status | When raised                              |
| ----------------------- | ------ | ---------------------------------------- |
| `AuthError`             | 401    | Missing or invalid Bearer token          |
| `ForbiddenError`        | 403    | Authenticated but not permitted          |
| `AdminRequiredError`    | 403    | Endpoint requires admin role             |
| `LockRequiredError`     | 403    | Command requires holding the device lock |
| `LockConflictError`     | 409    | Device already locked by another user    |
| `DeviceNotFoundError`   | 404    | Unknown device ID                        |
| `DeviceOfflineError`    | 503    | Device not currently reachable           |
| `ArtifactNotFoundError` | 404    | Unknown artifact ID                      |
| `SessionNotFoundError`  | 404    | Unknown session ID                       |
| `OpenBISError`          | 502    | OpenBIS upstream call failed             |

A global FastAPI exception handler catches any `AppError` and returns a consistent JSON response:

```json
{ "error": "LOCK_CONFLICT", "detail": "Device is currently locked by user X" }
```

---

### `app/core/dependencies.py` — Dependency Injection

Provides reusable FastAPI dependencies injected into route handlers.

- **`get_current_user`** — Extracts the Bearer token from the `Authorization` header, calls `openbis_client.validate_token()`, and returns a `UserInfo` object. Raises `AuthError` if the token is missing or rejected by OpenBIS.

- **`require_admin`** — Depends on `get_current_user` and additionally checks `user.is_admin`. Raises `AdminRequiredError` if not.

- **`make_lock_dependency`** — A factory that returns a dependency verifying three things before any command endpoint executes:
  1. A lock exists on the requested device
  2. The `session_id` in the request matches the lock's session
  3. The authenticated user's ID matches the lock's owner

---

### `app/locks/service.py` — Lock Service

Provides distributed, exclusive device locks stored in Redis with an automatic TTL.

Each lock is stored as a JSON string at key `lock:{device_id}` with the following fields:

```json
{
  "device_id": "scope-01",
  "owner_user": "jdoe",
  "session_id": "550e8400-...",
  "acquired_at": 1740235200.0,
  "last_seen": 1740235800.0
}
```

**Key methods:**

| Method                                         | What it does                                                   |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `acquire_lock(device_id, user_id, session_id)` | Atomic `SET NX EX` — succeeds only if no lock exists           |
| `release_lock(device_id, session_id)`          | Deletes the key only if `session_id` matches (ownership check) |
| `renew_lock(device_id, session_id)`            | Resets the TTL and updates `last_seen`                         |
| `get_lock(device_id)`                          | Returns current `LockInfo` or `None`                           |
| `force_release_lock(device_id)`                | Admin: delete lock regardless of ownership                     |
| `reset_all_locks()`                            | Admin/scheduler: delete all `lock:*` keys, returns count       |

If a client crashes without calling unlock, the lock expires after `LOCK_TTL_SECONDS` (default 30 min) and the device becomes available again.

---

### `app/buffer/service.py` — Buffer Service

Manages on-disk persistence of all acquisition artifacts. Each device/session combination gets its own subdirectory:

```
buffer/
└── {device_id}/
    └── {session_id}/
        ├── trace_0001_ch1.csv      # Time/voltage pairs with metadata header
        ├── trace_0001_meta.json    # Full instrument settings snapshot
        ├── screenshot_0002.png
        └── index.json              # Registry of all artifacts with persist flags
```

**CSV format** — human-readable, Excel-compatible:

```
# device: scope-01  channel: 1  acquired: 2026-02-22T14:30:00+00:00
# sample_rate: 1.000e+09  record_length: 10000  unit_x: s  unit_y: V
time_s,voltage_V
0.000000e+00,1.234567e-03
1.000000e-07,2.345678e-03
...
```

**Key methods:**

| Method                                                  | What it does                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `store_waveform(device_id, session_id, waveform, meta)` | Writes CSV + JSON metadata, updates `index.json`                 |
| `store_screenshot(device_id, session_id, png_bytes)`    | Writes PNG binary, updates `index.json`                          |
| `list_artifacts(session_id)`                            | Returns all `ArtifactInfo` for a session                         |
| `set_flag(session_id, artifact_id, persist)`            | Marks/unmarks artifact for OpenBIS commit                        |
| `get_flagged_artifacts(session_id)`                     | Returns only artifacts with `persist=True`                       |
| `export_hdf5(session_id, artifact_ids)`                 | Bundles selected traces into an HDF5 file with the unpack script |

The `index.json` file is the source of truth for what artifacts exist in a session and which ones are flagged for commit.

---

### `app/openbis_client/client.py` — OpenBIS Client

Wraps the `pybis` library for two purposes: **token validation** and **dataset registration**.

**Token validation** (`validate_token(token)`) is called on every authenticated request. Results are cached for `TOKEN_CACHE_SECONDS` (default 60 s) using a `cachetools.TTLCache` to avoid hammering OpenBIS with repeated session checks.

The method:

1. Calls `pybis.set_token()` and `is_session_active()`
2. Queries the user's ID and role assignments at the INSTANCE level
3. Grants `is_admin=True` if the user has the `ADMIN` or `INSTANCE_ADMIN` role
4. Returns a `UserInfo(user_id, display_name, is_admin)` dataclass

**Dataset registration** (`create_dataset(token, experiment_id, files, properties)`) uploads flagged artifact files to OpenBIS as a `RAW_DATA` dataset linked to the given experiment. Custom properties include `session_id`, `artifact_count`, and optionally `sample_id`. Returns the OpenBIS `permId`.

---

### `app/instruments/manager.py` — Instrument Manager

The central component for device lifecycle and command dispatch. At startup it reads `oscilloscopes.yaml`, creates a `DeviceEntry` for each oscilloscope, and spawns a dedicated async worker task per device.

**Device states:**

```
OFFLINE  ──(TCP reachable)──► ONLINE ──(lock acquired)──► LOCKED
  ▲                              │                           │
  │                         (command)                  (command)
  │                              ▼                           ▼
  └──(TCP lost)──────────── BUSY ◄──────────────────── BUSY
                                 │
                             (error)
                                 ▼
                               ERROR
```

**Worker pattern** — Each device has its own `asyncio.Queue`. When `execute_command(device_id, fn, timeout)` is called:

1. The coroutine function and a `Future` are placed on the device's queue
2. The device's dedicated worker picks it up and `await`s it
3. On success the future's result is set and the worker continues
4. On failure the future's exception is set and state transitions to `ERROR`

This design guarantees **serial execution per device** while allowing **parallel execution across devices**.

**Key methods:**

| Method                                    | What it does                                        |
| ----------------------------------------- | --------------------------------------------------- |
| `startup()`                               | Loads YAML config, creates entries, spawns workers  |
| `shutdown()`                              | Cancels workers, disconnects all drivers            |
| `execute_command(device_id, fn, timeout)` | Queues a command and awaits its result              |
| `get_device_list()`                       | Returns `DeviceStatus` for all devices              |
| `instantiate_driver(device_id)`           | Dynamically imports and constructs the driver class |

---

### `app/instruments/base_driver.py` — Base Driver

Defines the abstract interface every oscilloscope driver must implement. Real hardware drivers (and the mock) subclass `BaseOscilloscopeDriver`.

**Data classes defined here:**

| Class            | Fields                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `WaveformData`   | `channel`, `time_array`, `voltage_array`, `sample_rate`, `record_length`, `unit_x`, `unit_y` |
| `ChannelConfig`  | `channel`, `enabled`, `scale_v_div`, `offset_v`, `coupling`, `probe_attenuation`             |
| `TimebaseConfig` | `scale_s_div`, `offset_s`, `sample_rate`                                                     |
| `TriggerConfig`  | `source`, `level_v`, `slope`, `mode`                                                         |
| `InstrumentInfo` | `idn`, `ip`, `firmware`                                                                      |

**Abstract methods every driver must implement:**

```python
connect()                        # Open connection to the instrument
disconnect()                     # Close connection
identify() -> InstrumentInfo     # Query *IDN? or equivalent
run()                            # Start acquisition
stop()                           # Stop acquisition
acquire_waveform(channel) -> WaveformData
get_screenshot() -> bytes        # Return PNG bytes
get_channel_config(channel) -> ChannelConfig
get_timebase() -> TimebaseConfig
get_trigger() -> TriggerConfig
```

**Concrete method:** `get_all_settings()` collects a complete snapshot of instrument state by calling the above getters and assembling a dict — used for metadata JSON files.

---

### `app/instruments/mock_driver.py` — Mock Driver

A fully functional in-memory driver that generates synthetic data. Used during development (`DEBUG=True`) and in tests.

- **Waveforms:** Sine waves at 1 kHz, 1.5 kHz, 2 kHz, 2.5 kHz per channel, plus Gaussian noise
- **Screenshots:** Minimal valid 640×480 white PNG (no PIL dependency)
- **State:** Pure in-memory, no I/O, instant responses
- Channel 1 is enabled by default; channels 2–4 are disabled

---

### `app/instruments/health_monitor.py` — Health Monitor

A background async task that periodically (every `HEALTH_CHECK_INTERVAL_SECONDS`) attempts a TCP connection to each device's IP and port.

**Behaviour per device on each cycle:**

| Current state        | TCP reachable? | Action                                                    |
| -------------------- | -------------- | --------------------------------------------------------- |
| `BUSY`               | any            | Skip — don't interrupt active command                     |
| `OFFLINE`            | yes            | Instantiate driver, `connect()`, `identify()`, → `ONLINE` |
| `ERROR`              | yes            | Attempt recovery: reconnect, → `ONLINE`                   |
| `ONLINE` or `LOCKED` | no             | Log warning, disconnect driver, → `OFFLINE`               |

Health monitoring is disabled entirely in `DEBUG` mode since mock drivers never go offline.

---

### `app/scheduler/tasks.py` — Scheduler

Uses `APScheduler` to run a single cron job: **`eod_lock_reset`** fires at **23:59 every day** (in the configured `EOD_RESET_TIMEZONE`).

The job calls `lock_service.reset_all_locks()`, which deletes every `lock:*` key in Redis, and then resets every device in `LOCKED` state back to `ONLINE` in the `InstrumentManager`. This ensures no stale locks carry over to the next day.

---

### `drivers/my_oscilloscope.py` — Driver Template

A skeleton file with `pass` implementations of all abstract methods. Copy this file, implement the methods using your instrument's SCPI or vendor SDK, and register it in `oscilloscopes.yaml`.

---

### `scripts/unpack_hdf5.py` — HDF5 Unpacker

A standalone Python script that extracts all datasets from an HDF5 export into individual CSV files. It is bundled directly inside the HDF5 file (as a string dataset) so recipients who receive only the `.h5` file can extract and run it without needing the full service installed.

---

## API Reference

### Authentication

| Method | Path       | Description                                                            |
| ------ | ---------- | ---------------------------------------------------------------------- |
| `GET`  | `/auth/me` | Returns `{user_id, display_name, is_admin}` for the authenticated user |

All endpoints require `Authorization: Bearer <openbis-session-token>`.

---

### Devices — `/devices`

| Method | Path                               | Lock required? | Description                                                       |
| ------ | ---------------------------------- | -------------- | ----------------------------------------------------------------- |
| `GET`  | `/devices`                         | No             | List all devices with state and lock info                         |
| `GET`  | `/devices/{id}`                    | No             | Single device detail + capabilities                               |
| `POST` | `/devices/{id}/lock`               | No             | Acquire exclusive lock; returns `control_session_id`              |
| `POST` | `/devices/{id}/unlock`             | Own lock       | Release lock                                                      |
| `POST` | `/devices/{id}/heartbeat`          | Own lock       | Renew lock TTL (call every few minutes)                           |
| `POST` | `/devices/{id}/run`                | Yes            | Start oscilloscope acquisition                                    |
| `POST` | `/devices/{id}/stop`               | Yes            | Stop acquisition                                                  |
| `POST` | `/devices/{id}/acquire`            | Yes            | Acquire all enabled channels + screenshot; returns `artifact_ids` |
| `GET`  | `/devices/{id}/channels/{ch}/data` | Yes            | Latest waveform for channel as JSON arrays                        |
| `GET`  | `/devices/{id}/screenshot`         | Yes            | Latest screenshot as PNG bytes                                    |

Command endpoints (`run`, `stop`, `acquire`, `data`, `screenshot`) require the caller to pass the `session_id` returned from `/lock`. The server verifies that the session and user match the current lock before executing.

---

### Sessions — `/sessions`

| Method | Path                                  | Description                                             |
| ------ | ------------------------------------- | ------------------------------------------------------- |
| `GET`  | `/sessions/{id}/artifacts`            | List all artifacts (traces + screenshots) for a session |
| `POST` | `/sessions/{id}/artifacts/{art}/flag` | Set `persist: true/false` to mark/unmark for commit     |
| `POST` | `/sessions/{id}/commit`               | Upload flagged artifacts to OpenBIS; returns `permId`   |

The `/commit` endpoint requires a JSON body with `experiment_id` (OpenBIS experiment identifier) and an optional `sample_id`.

---

### Admin — `/admin`

| Method | Path                               | Description                                         |
| ------ | ---------------------------------- | --------------------------------------------------- |
| `POST` | `/admin/locks/reset`               | Clear all locks in Redis (admin role required)      |
| `POST` | `/admin/devices/{id}/force-unlock` | Force-release one device lock (admin role required) |

---

## Key Data Flows

### Typical Acquisition Session

```
1. POST /devices/{id}/lock
   → OpenBIS token validated
   → Redis SET lock:{id} NX EX 1800
   → Returns session_id (UUID)

2. [Every ~5 min] POST /devices/{id}/heartbeat  { session_id }
   → Redis TTL reset to 1800 s

3. POST /devices/{id}/run  { session_id }
   → Lock ownership verified
   → driver.run() queued on device worker

4. POST /devices/{id}/acquire  { session_id }
   → For each enabled channel: driver.acquire_waveform(ch)
   → BufferService writes trace_{n}_ch{ch}.csv + trace_{n}_meta.json
   → driver.get_screenshot() → screenshot_{n}.png
   → Returns list of artifact_ids

5. GET /sessions/{session_id}/artifacts
   → Returns artifact list from index.json

6. POST /sessions/{session_id}/artifacts/{id}/flag  { persist: true }
   → Sets persist flag in index.json

7. POST /sessions/{session_id}/commit  { experiment_id: "/SPACE/PROJ/EXP" }
   → Collects flagged artifact files
   → pybis creates RAW_DATA dataset in OpenBIS
   → Returns permId

8. POST /devices/{id}/unlock  { session_id }
   → Redis DEL lock:{id}
   → Device state → ONLINE
```

### Lock Expiry

If the client disappears without calling `/unlock`, the Redis key expires after `LOCK_TTL_SECONDS`. The `HealthMonitor` and any subsequent `/lock` request will find the key gone and treat the device as available. The daily 23:59 scheduler also clears any remaining locks as a safety net.

### Adding a Real Oscilloscope Driver

1. Copy `drivers/my_oscilloscope.py`, rename it, and implement all abstract methods using the instrument's communication protocol (SCPI over TCP/socket, vendor SDK, etc.).
2. Add the device to `config/oscilloscopes.yaml`:
   ```yaml
   oscilloscopes:
     - id: "scope-lab3"
       ip: "192.168.1.105"
       port: 5025
       label: "Keysight DSOX3034T"
       driver: "drivers.my_oscilloscope.MyOscilloscope"
   ```
3. Restart the service. The `InstrumentManager` dynamically imports the driver class by path.

In `DEBUG=True` mode the driver field is ignored and the `MockOscilloscopeDriver` is always used.
