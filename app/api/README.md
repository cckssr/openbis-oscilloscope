# `app/api/` — HTTP Route Handlers

All FastAPI routers. Each file is a single router mounted in `app/main.py`.

## Files

### `auth.py` — `/auth`

| Method | Path       | Auth   | Description                                                                 |
| ------ | ---------- | ------ | --------------------------------------------------------------------------- |
| GET    | `/auth/me` | Bearer | Returns `UserInfo` for the authenticated user (id, display_name, is_admin). |

---

### `devices.py` — `/devices`

| Method | Path                              | Auth   | Lock needed | Description                                                                  |
| ------ | --------------------------------- | ------ | ----------- | ---------------------------------------------------------------------------- |
| GET    | `/devices`                        | Bearer | —           | List all devices with their current state and lock info.                     |
| GET    | `/devices/{device_id}`            | Bearer | —           | Detailed device info: state, label, capabilities.                            |
| POST   | `/devices/{device_id}/lock`       | Bearer | —           | Acquire exclusive lock. Returns `session_id`.                                |
| DELETE | `/devices/{device_id}/lock`       | Bearer | Own lock    | Release the lock.                                                            |
| POST   | `/devices/{device_id}/run`        | Bearer | Own lock    | Start continuous acquisition.                                                |
| POST   | `/devices/{device_id}/stop`       | Bearer | Own lock    | Stop acquisition.                                                            |
| POST   | `/devices/{device_id}/acquire`    | Bearer | Own lock    | Acquire waveform from `?channel=N`. Stores artifact, returns `ArtifactInfo`. |
| POST   | `/devices/{device_id}/screenshot` | Bearer | Own lock    | Capture screen. Stores PNG artifact, returns `ArtifactInfo`.                 |

---

### `sessions.py` — `/sessions`

| Method | Path                                                        | Auth   | Description                                               |
| ------ | ----------------------------------------------------------- | ------ | --------------------------------------------------------- |
| GET    | `/sessions/{session_id}/artifacts`                          | Bearer | List all `ArtifactInfo` entries in the session.           |
| POST   | `/sessions/{session_id}/artifacts/{artifact_id}/flag`       | Bearer | Toggle `persist` flag. Body: `{"persist": true/false}`.   |
| POST   | `/sessions/{session_id}/commit`                             | Bearer | Push all flagged artifacts to OpenBIS as a new dataset.   |
| GET    | `/sessions/{session_id}/artifacts/{artifact_id}/{filename}` | Bearer | Download a specific artifact file (CSV, PNG, JSON, HDF5). |

---

### `admin.py` — `/admin`

All endpoints require `require_admin()`.

| Method | Path                                 | Description                                                        |
| ------ | ------------------------------------ | ------------------------------------------------------------------ |
| GET    | `/admin/status`                      | Full service status: all device states, all active locks.          |
| POST   | `/admin/locks/reset`                 | Force-clear all Redis locks and set LOCKED devices to ONLINE.      |
| POST   | `/admin/devices/{device_id}/recover` | Manually trigger reconnection attempt for a device in ERROR state. |

---

## Dependency injection pattern

Route handlers receive services via `Depends`:

```python
# Example from devices.py
async def acquire(
    device_id: str,
    channel: int,
    user: UserInfo = Depends(get_current_user),
    _lock: None = Depends(make_lock_dependency("device_id")),
    instrument_manager: InstrumentManager = Depends(get_instrument_manager),
    buffer_service: BufferService = Depends(get_buffer_service),
):
    ...
```

All service getters (`get_instrument_manager`, `get_buffer_service`, etc.) are defined in `app/core/dependencies.py` and read from `request.app.state`.
