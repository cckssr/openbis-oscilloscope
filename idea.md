# Tech Stack & Architecture Overview — FastAPI Oscilloscope Control Service (OpenBIS-integrated)

## 1. Scope and goals

The service provides a server-side control plane for LAN-connected oscilloscopes using PyMeasure, with a web-facing API consumed by the OpenBIS web UI (plain JavaScript). It must support multiple users and multiple oscilloscopes concurrently, enforce exclusive device locks, stream or deliver acquired data without cross-talk, and persist only user-flagged acquisitions into OpenBIS datasets with correct metadata.

### Non-goals (explicit)

- No direct instrument access from the browser.
- No UI framework requirement (the OpenBIS UI remains the frontend; integration via REST + optional streaming endpoints).
- No long-running state stored only in browser memory; all relevant state is server-side.

## 2. High-level architecture

### Components

1. FastAPI API Server**

   - Provides REST endpoints for authentication, device listing, device lock control, command execution, data retrieval, screenshot retrieval, and flagging acquisitions for later persistence.
   - Enforces authorization and lock ownership on every instrument-affecting call.

2. Instrument Manager (server-side)**

   - Maintains a registry of configured oscilloscopes (IP list) and their current connectivity/health.
   - Owns per-device control channels and ensures serialized access to each instrument (one active controller at a time).

3. Background Health Monitor**

   - Continuous connectivity checks (ping/SCPI `*IDN?` or lightweight status query).
   - Updates device state (ONLINE/OFFLINE/BUSY/LOCKED/ERROR).
   - Handles reconnection logic, without losing already buffered data.

4. Data Buffer / Session Store**

   - Temporary storage for acquired traces and screenshots plus metadata.
   - Supports “flag-for-persistence” so only flagged artifacts are later registered to OpenBIS.

5. OpenBIS Integration Client (pybis)**

   - Validates session tokens on request or caches validations briefly.
   - Registers datasets (and metadata) for flagged artifacts either:
     1. on user request (“commit now”), or
     2. via a datastore workflow that consumes flagged files.

### Deployment layout (recommended)

- FastAPI + Uvicorn behind a reverse proxy (nginx/traefik).
- Persistent volume for temporary data buffer (so service restart does not wipe buffered data).
- Separate worker process or asyncio tasks for monitoring and per-device command queues.

## 3. Technology choices

### Backend runtime

- Python 3.11+ (asyncio improvements, typing)
- FastAPI (REST + WebSocket capability if needed)
- Uvicorn (ASGI server)

### Auth and OpenBIS

- pybis for OpenBIS session-token validation and dataset registration.
- Token model: browser holds OpenBIS session token; sends it to FastAPI (Authorization header or cookie); FastAPI validates with pybis.
- Optional: short-lived local cache of token validation (e.g., 30–120 s) to reduce OpenBIS load.

### Instrument control

- PyMeasure Device classes (your driver) for SCPI/connection logic.
- VISA/SCPI transport as used by PyMeasure (LAN).

### Data and state

- Redis (recommended) for locks + session metadata + TTL resets (fast, atomic).
- Local filesystem or object store for buffered binary artifacts (PNG, waveform dumps, HDF5/NPZ).
- SQLite/Postgres optional if you need audit logs and durable history beyond temp buffering (not required for the core).

### Concurrency model

- Per-device command queue (single consumer) to prevent concurrent SCPI collisions.
- Multi-user handled at the API layer; collisions prevented by lock ownership + per-device queue.

## 4. State model and invariants

### Device state (example)

- OFFLINE: no connection
- ONLINE: reachable, not locked
- LOCKED: locked by a user
- BUSY: executing acquisition/command sequence
- ERROR: driver/transport error (with `last_error`)

### Lock invariants

- Exactly one lock owner per device at a time.
- Lock has TTL; renewed on activity (heartbeat).
- Expiration policy:
  - Idle TTL (e.g., 30 min)
  - Hard daily reset at local end-of-day (Europe/Berlin), regardless of TTL, to clear forgotten sessions.
- Only lock owner can send “mutating” commands (Run/Stop/config/acquire). Read-only calls may be allowed without lock, but that complicates privacy and predictability; default: require lock for everything except device list/health.

### Session invariants

- Data buffered is namespaced by (device_id, lock_session_id) so multiple users and devices do not collide.
- A device reconnect must not delete buffered artifacts; buffer survives device outages.

## 5. Authentication and authorization

### Mechanism

- Client supplies OpenBIS session token (session-based auth).
- FastAPI validates token via pybis:
  - Validate token is active.
  - Identify user (userId) and optionally roles/groups.
- FastAPI issues its own internal “control session” id (optional but recommended):
  - Ties together lock ownership, buffered data, and audit trail.
  - Derived from OpenBIS user + token hash, but stored server-side.

### Authorization rules (minimum)

- Any request that affects an instrument requires:
  1. valid OpenBIS session token
  2. active lock for that device owned by that user/session
- Admin override endpoints (optional): force unlock, kill session.

## 6. Oscilloscope discovery and monitoring

### Configured IP list

- Static list in config (YAML/env) or OpenBIS-maintained list (optional later).

### Health monitor

- Runs periodically (e.g., every 2–5 s) and performs:
  - reachability check (TCP connect or lightweight SCPI query)
  - update state store
- If device transitions OFFLINE→ONLINE:
  - reinitialize PyMeasure device instance
  - restore last known config snapshot if needed (only if safe and desired)
- If device goes ONLINE→OFFLINE during acquisition:
  - mark acquisition as “interrupted”
  - keep buffered partial data
  - allow later continuation or commit partial data with metadata flag

## 7. Locking and end-of-day reset

### Lock backend

- Redis key: `lock:{device_id}` -> `{owner_user, session_id, acquired_at, last_seen}`
- TTL applied; renewed on “heartbeat” endpoint or any successful command.

### End-of-day reset

- Scheduled job (cron-like) in service:
  - At 23:59:xx Europe/Berlin: clear all locks (or all locks older than today).
  - Also provide explicit endpoint:
    - `POST /admin/locks/reset` (admin only)

## 8. Command execution and response verification

### Command API design

- Expose a constrained set of operations (Run, Stop, acquire waveform, read channel data, screenshot).
- Each operation maps to a driver method; avoid arbitrary SCPI passthrough initially (security + stability).

### Response verification

- Each operation returns:
  - `status`: ok/error
  - `instrument_response`: parsed/validated payload
  - timestamp and duration
  - optional raw response (debug mode only)
- Apply timeouts per command; on timeout -> mark device ERROR but keep lock (or release lock if transport broken; define policy).

## 9. Screenshot delivery to OpenBIS web UI

### Flow

- Client requests screenshot for device it has locked:
  - `GET /devices/{id}/screenshot`
- FastAPI calls `PyMeasure get_display_data()` -> bytes.
- Returns:
  - `Content-Type: image/png`
  - bytes stream
- Optional caching:
  - Store last screenshot with timestamp in buffer to reduce instrument load.

## 10. Temporary data storage and “flag for persistence”

### Buffer content

- Waveforms: channel traces, time axis, acquisition parameters
- Screenshots: PNG
- Metadata snapshot:
  - instrument IDN, firmware, IP
  - channel settings, timebase, trigger, vertical scales
  - userId, control_session_id
  - timestamps, errors, reconnect events

### Storage format

- Recommended: one folder per (device_id, control_session_id)
- `/buffer/{device}/{session}/`
- `trace_0001.npz` (or `.h5`)
- `trace_0001.json` (metadata)
- `screenshot_0001.png`
- `session.json` (global session metadata)

### Flagging model

- Each artifact has a boolean “persist” flag stored in Redis/JSON index.
- Endpoint to set/unset persist flag.
- Commit endpoint triggers packaging only flagged artifacts.

### OpenBIS dataset creation options

- Option A (direct registration by service, preferred)**

  - `POST /sessions/{session_id}/commit`
  - Service creates dataset via pybis:
    - dataset type + properties
    - attaches flagged files
    - links to a sample/experiment identifier provided by UI (must be validated)

- Option B (datastore workflow consumes flagged files)**

  - Service writes flagged bundle into a watched dropbox folder with manifest
  - Existing OpenBIS dropbox ingests and registers dataset
  - UI polls for ingestion result

## 11. Continuous recovery without data loss

### Design points

- Buffered data is written immediately to disk (not only in RAM).
- State store (Redis) tracks:
  - current lock owner
  - current acquisition sequence number
  - device last known config snapshot
  - offline/online transitions with timestamps
- On restart of FastAPI:
  - reload buffer index from disk manifests
  - locks may be lost unless stored in Redis (hence Redis recommended)
- On device power-off mid-session:
  - lock remains until TTL expires; user can keep ownership if device returns quickly
  - acquisitions marked interrupted; user can continue or commit partial results

## 12. REST API surface (proposed)

### Authentication

- `GET /auth/me`
- Validates OpenBIS token; returns user identity and permissions

### Devices

- `GET /devices`
- Returns list: id, ip, state, lock info (owner masked unless owner/admin), last_seen, last_error
- `GET /devices/{id}`
- Detailed status and capabilities

### Locks

- `POST /devices/{id}/lock`
- Acquire lock (returns control_session_id)
- `POST /devices/{id}/unlock`
- Release lock
- `POST /devices/{id}/heartbeat`
- Renew lock TTL

### Commands (examples)

- `POST /devices/{id}/run`
- `POST /devices/{id}/stop`
- `GET /devices/{id}/channels/{ch}/data`
- returns waveform payload or reference to buffered artifact
- `POST /devices/{id}/acquire`
- triggers acquisition; returns artifact id(s)
- `GET /devices/{id}/screenshot`
- returns image/png bytes

### Buffer and persistence

- `GET /sessions/{session_id}/artifacts`
- list artifacts with flags and metadata summary
- `POST /sessions/{session_id}/artifacts/{artifact_id}/flag`
- set `persist=true/false`
- `POST /sessions/{session_id}/commit`
- creates OpenBIS dataset (or prepares dropbox package), returns dataset permId / ingestion token

### Admin (optional)

- `POST /admin/locks/reset`
- `POST /admin/devices/{id}/force-unlock`

## 13. Integration with OpenBIS “classic” web UI (no React)

### Frontend consumption pattern

- Use `fetch()` calls to REST endpoints (with OpenBIS token in header).
- Polling for status (device list) every few seconds, or SSE/WebSocket if you want live updates.
- Screenshot rendering:
  - `<img>` with auth handled via headers is tricky; better: fetch blob and set objectURL, or use cookie-based auth to allow direct img src.

## 14. Open questions you should decide early (they affect implementation)

- Token transport: Authorization header vs cookie (cookie simplifies, but increases CSRF requirements).
- Do you require lock for read-only calls (recommended yes for simplicity).
- Commit path: direct pybis registration vs dropbox workflow.
- Data format: NPZ/HDF5/Zarr; expected data volume and retention time.
- Monitoring frequency and what constitutes “ONLINE” (ping vs SCPI query).
