# `app/buffer/` — On-Disk Artifact Storage

Persists waveforms, screenshots, and HDF5 exports to the local file system and maintains a per-session index. Files flagged for long-term storage are later committed to OpenBIS by the sessions API.

## Files

### `service.py`

**`ArtifactInfo`** — metadata entry in `index.json`:

| Field         | Type          | Description                                                  |
| ------------- | ------------- | ------------------------------------------------------------ |
| `artifact_id` | `str`         | UUID for this artifact                                       |
| `type`        | `str`         | `"trace"` or `"screenshot"`                                  |
| `channel`     | `int \| None` | Channel number for traces; `None` for screenshots            |
| `sequence`    | `int`         | Monotonically increasing counter within the session          |
| `persist`     | `bool`        | If `True`, included in the next OpenBIS commit               |
| `created_at`  | `datetime`    | Timestamp of acquisition                                     |
| `files`       | `list[str]`   | Relative paths of stored files (CSV + metadata JSON, or PNG) |

**`BufferService`** — methods:

| Method                                                       | Description                                                                                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store_waveform(device_id, session_id, waveform)`            | Writes `<artifact_id>.csv` (time, voltage columns) and `<artifact_id>_meta.json` (channel config, timebase, trigger, instrument). Returns `ArtifactInfo`. |
| `store_screenshot(device_id, session_id, png_bytes)`         | Writes `<artifact_id>.png`. Returns `ArtifactInfo`.                                                                                                       |
| `list_artifacts(device_id, session_id)`                      | Reads `index.json` and returns all `ArtifactInfo` entries for the session.                                                                                |
| `flag_artifact(device_id, session_id, artifact_id, persist)` | Toggles the `persist` flag for a single artifact in `index.json`.                                                                                         |
| `export_hdf5(device_id, session_id)`                         | Bundles all traces in the session into a single HDF5 file. Each channel is stored as a dataset with time and voltage arrays plus metadata attributes.     |

## Directory layout

```
{BUFFER_DIR}/
  {device_id}/
    {session_id}/
      index.json                  ← registry of all artifacts in the session
      {artifact_id}.csv           ← waveform data (time, voltage)
      {artifact_id}_meta.json     ← acquisition metadata
      {artifact_id}.png           ← screenshot
      {session_id}.h5             ← HDF5 export (created on demand)
```

`BUFFER_DIR` defaults to `./buffer_data` and is configurable via the environment.
