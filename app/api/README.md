# `app/api/` — HTTP Route Handlers

All FastAPI routers. Each file is a single router mounted in `app/main.py`.

## Files

### `auth.py` — `/auth`

| Method | Path       | Auth   | Description                                                                 |
| ------ | ---------- | ------ | --------------------------------------------------------------------------- |
| GET    | `/auth/me` | Bearer | Returns `UserInfo` for the authenticated user (id, display_name, is_admin). |

---

### `devices.py` — `/devices`

| Method | Path                                    | Auth   | Lock needed | Description                                                               |
| ------ | --------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------- |
| GET    | `/devices`                              | Bearer | —           | List all devices with their current state and lock info.                  |
| GET    | `/devices/{device_id}`                  | Bearer | —           | Detailed device info: state, label, capabilities.                         |
| POST   | `/devices/{device_id}/lock`             | Bearer | —           | Acquire exclusive lock. Returns `control_session_id`.                     |
| POST   | `/devices/{device_id}/unlock`           | Bearer | Own lock    | Release the lock (`?session_id=`).                                        |
| POST   | `/devices/{device_id}/heartbeat`        | Bearer | Own lock    | Renew lock TTL (`?session_id=`).                                          |
| POST   | `/devices/{device_id}/run`              | Bearer | Own lock    | Start continuous acquisition (`?session_id=`).                            |
| POST   | `/devices/{device_id}/stop`             | Bearer | Own lock    | Stop acquisition (`?session_id=`).                                        |
| POST   | `/devices/{device_id}/acquire`          | Bearer | Own lock    | Capture all enabled channels + screenshot. Returns `artifact_ids`.        |
| GET    | `/devices/{device_id}/channels/{ch}/data` | Bearer | Own lock  | Latest waveform for channel as JSON `{time_s, voltage_V}` arrays.        |
| GET    | `/devices/{device_id}/screenshot`       | Bearer | Own lock    | Live screenshot as `image/png`.                                           |

---

### `sessions.py` — `/sessions`

| Method | Path                                          | Auth   | Description                                                             |
| ------ | --------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| GET    | `/sessions/{session_id}/artifacts`            | Bearer | List all `ArtifactInfo` entries in the session (empty list if none).    |
| POST   | `/sessions/{session_id}/artifacts/{id}/flag`  | Bearer | Set or clear the `persist` flag (`?persist=true/false`).                |
| POST   | `/sessions/{session_id}/commit`               | Bearer | Upload all flagged artifacts to OpenBIS as a new `RAW_DATA` dataset. Requires `?experiment_id=`. Returns `permId` + `artifact_count`. |

---

### `admin.py` — `/admin`

All endpoints require `require_admin()` (HTTP 403 for non-admins).

| Method | Path                                      | Description                                                     |
| ------ | ----------------------------------------- | --------------------------------------------------------------- |
| POST   | `/admin/locks/reset`                      | Clear all Redis locks; reset LOCKED devices to ONLINE.          |
| POST   | `/admin/devices/{device_id}/force-unlock` | Force-release one device's lock regardless of who holds it.     |

---

## Error response format

All errors raised via the `AppError` hierarchy return JSON with two fields:

```json
{"error": "lock_conflict", "detail": "Device 'scope-01' is locked by 'alice'"}
```

The `error` field is a snake_case slug; see `app/core/exceptions.py` for the full list.
