# `app/api/` — HTTP Route Handlers

All FastAPI routers. Each file is a single router mounted in `app/main.py`.

## Files

### `auth.py` — `/auth`

| Method | Path       | Auth   | Description                                                                 |
| ------ | ---------- | ------ | --------------------------------------------------------------------------- |
| GET    | `/auth/me` | Bearer | Returns `UserInfo` for the authenticated user (id, display_name, is_admin). |

---

### `devices.py` — `/devices`

| Method | Path                                        | Auth   | Lock needed | Description                                                                                                                                                                                                                                                                                                        |
| ------ | ------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/devices`                                  | Bearer | —           | List all devices with state, lock info, `online_since_utc`, and `uptime_minutes`.                                                                                                                                                                                                                                  |
| GET    | `/devices/{device_id}`                      | Bearer | —           | Detailed device info: state, label, capabilities, `online_since_utc`, `uptime_minutes`. Lock object includes `session_id` when `is_mine` is true.                                                                                                                                                                  |
| POST   | `/devices/{device_id}/lock`                 | Bearer | —           | Acquire exclusive lock. Returns `control_session_id`.                                                                                                                                                                                                                                                              |
| POST   | `/devices/{device_id}/unlock`               | Bearer | Own lock    | Release the lock (`?session_id=`).                                                                                                                                                                                                                                                                                 |
| POST   | `/devices/{device_id}/heartbeat`            | Bearer | Own lock    | Renew lock TTL (`?session_id=`).                                                                                                                                                                                                                                                                                   |
| POST   | `/devices/{device_id}/run`                  | Bearer | Own lock    | Start continuous acquisition (`?session_id=`).                                                                                                                                                                                                                                                                     |
| POST   | `/devices/{device_id}/stop`                 | Bearer | Own lock    | Stop acquisition (`?session_id=`).                                                                                                                                                                                                                                                                                 |
| POST   | `/devices/{device_id}/acquire`              | Bearer | Own lock    | Capture waveforms. Optional `?channels=1&channels=3` limits channels; `?max_samples=true` acquires full memory depth (MAX mode, timeout 120 s); `?run_id=<uuid>` groups acquisitions from one RUN press. Driver I/O runs in a thread pool. Returns `artifact_ids`, `acquisition_id`, `session_id`, and `channels`. |
| GET    | `/devices/{device_id}/channels/{ch}/data`   | Bearer | Own lock    | Latest waveform for channel as JSON `{time_s, voltage_V}` arrays.                                                                                                                                                                                                                                                  |
| GET    | `/devices/{device_id}/screenshot`           | Bearer | Own lock    | Live screenshot as `image/png`. Does **not** save to buffer.                                                                                                                                                                                                                                                       |
| POST   | `/devices/{device_id}/screenshot`           | Bearer | Own lock    | Capture screenshot, save to buffer, return `{artifact_id}`.                                                                                                                                                                                                                                                        |
| GET    | `/devices/{device_id}/settings`             | Bearer | —           | All channel configs, timebase, and trigger as a single snapshot.                                                                                                                                                                                                                                                   |
| GET    | `/devices/{device_id}/probe`                | Bearer | —           | Step-by-step connectivity diagnostic: TCP check → driver connect → `*IDN?`. Returns per-step result and error. Does not affect device state.                                                                                                                                                                       |
| PUT    | `/devices/{device_id}/channels/{ch}/config` | Bearer | Own lock    | Apply channel config (`enabled`, `scale_v_div`, `offset_v`, `coupling`, `probe_attenuation`).                                                                                                                                                                                                                      |
| PUT    | `/devices/{device_id}/timebase`             | Bearer | Own lock    | Apply timebase (`scale_s_div`, `offset_s`).                                                                                                                                                                                                                                                                        |
| PUT    | `/devices/{device_id}/trigger`              | Bearer | Own lock    | Apply trigger (`source`, `level_v`, `slope`, `mode`).                                                                                                                                                                                                                                                              |

---

### `sessions.py` — `/sessions`

| Method | Path                                                              | Auth   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/sessions/{session_id}/artifacts`                                | Bearer | List all `ArtifactInfo` entries (includes `acquisition_id`, `annotation`, `run_id` fields). Empty list if none.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| POST   | `/sessions/{session_id}/artifacts/{id}/flag`                      | Bearer | Set or clear the `persist` flag (`?persist=true/false`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| POST   | `/sessions/{session_id}/commit`                                   | Bearer | Upload all flagged artifacts as an `OSCILLOSCOPE` dataset. JSON body: `{experiment_id, object_id?, lab_course?, exp_title?, group_name?, semester?, exp_description?, device_under_test?, measurement_purpose?, keywords?, data_quality?, external_parameters?, notes?}`. `experiment_id` must be the full collection path `/SPACE/PROJECT/COLLECTION`. If `sample_id` is provided the dataset is attached to that object instead of the collection. Derived properties (timestamps, channel count, has_screenshots, has_csv) are computed from the flagged artifacts. Returns `permId` + `artifact_count`. |
| POST   | `/sessions/{session_id}/acquisitions/{acquisition_id}/annotation` | Bearer | Set annotation text on all artifacts sharing `acquisition_id`. Body: `{"annotation": "text"}`. Returns `{acquisition_id, annotation}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GET    | `/sessions/{session_id}/artifacts/{artifact_id}/data`             | Bearer | Return `{artifact_id, channel, time_s, voltage_V}` for a trace artifact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| GET    | `/sessions/{session_id}/artifacts/{artifact_id}/image`            | Bearer | Return `image/png` bytes for a screenshot artifact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

---

### `openbis_structure.py` — `/openbis/structure`

Live OpenBIS hierarchy queries (lazily loaded, 5-minute TTL cache per token+params). All require Bearer auth; the user's token is forwarded to pybis.

| Method | Path                             | Query params              | Response items                       |
| ------ | -------------------------------- | ------------------------- | ------------------------------------ |
| GET    | `/openbis/structure/projects`    | `?space=` (optional)      | `[{code, display_name, semester}]`   |
| GET    | `/openbis/structure/collections` | `?project=`, `?space=`    | `[{code, display_name, identifier}]` |
| GET    | `/openbis/structure/objects`     | `?collection=`, `?space=` | `[{code, type, identifier}]`         |

`display_name` for projects is derived from the code (e.g. `DI_X_LOLOVIC` → `Dienstag — LOLOVIC`). `identifier` for collections is the full path `/SPACE/PROJECT/COLLECTION`, suitable for use as `experiment_id` in the commit endpoint. `identifier` for objects is the full OpenBIS sample path, suitable for use as `object_id`. The default space is `settings.OPENBIS_SPACE` (`GP_2025_WISE`).

---

### `admin.py` — `/admin`

All endpoints require `require_admin()` (HTTP 403 for non-admins).

| Method | Path                                      | Description                                                 |
| ------ | ----------------------------------------- | ----------------------------------------------------------- |
| POST   | `/admin/locks/reset`                      | Clear all Redis locks; reset LOCKED devices to ONLINE.      |
| POST   | `/admin/devices/{device_id}/force-unlock` | Force-release one device's lock regardless of who holds it. |

---

## Error response format

All errors raised via the `AppError` hierarchy return JSON with two fields:

```json
{ "error": "lock_conflict", "detail": "Device 'scope-01' is locked by 'alice'" }
```

The `error` field is a snake_case slug; see `app/core/exceptions.py` for the full list.
