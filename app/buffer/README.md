# `app/buffer/` — On-Disk Artifact Storage

Persists waveforms, screenshots, and HDF5 exports to the local file system and maintains a per-session index. Files flagged for long-term storage are later committed to OpenBIS by the sessions API.

## Files

### `service.py`

**`ArtifactInfo`** — one entry per stored artifact, persisted in `index.json`:

| Field           | Type          | Description                                                            |
| --------------- | ------------- | ---------------------------------------------------------------------- |
| `artifact_id`   | `str`         | E.g. `"trace_0001_ch1"` or `"screenshot_0002"`                        |
| `artifact_type` | `str`         | `"trace"` or `"screenshot"`                                            |
| `channel`       | `int \| None` | 1-based channel number for traces; `None` for screenshots              |
| `seq`           | `int`         | Monotonically increasing sequence number within the session            |
| `persist`       | `bool`        | `True` → included in the next OpenBIS commit                           |
| `created_at`    | `str`         | ISO-8601 UTC timestamp                                                 |
| `files`         | `list[str]`   | Filenames relative to the session dir (e.g. `["trace_0001_ch1.csv", "trace_0001_meta.json"]`) |

**`BufferService`** — public methods:

| Method                                                        | Returns              | Description                                                                                     |
| ------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `store_waveform(device_id, session_id, waveform, meta)`       | `str`                | Writes CSV + JSON sidecar; registers in `index.json`. Returns `artifact_id`.                    |
| `store_screenshot(device_id, session_id, png_bytes)`          | `str`                | Writes PNG; registers in `index.json`. Returns `artifact_id`.                                   |
| `list_artifacts(session_id)`                                  | `list[ArtifactInfo]` | Returns all artifacts for the session. Searches across all device dirs. Empty list if not found. |
| `set_flag(session_id, artifact_id, persist)`                  | `None`               | Toggle the `persist` flag. Raises `SessionNotFoundError` / `ArtifactNotFoundError`.             |
| `get_flagged_artifacts(session_id)`                           | `list[ArtifactInfo]` | Returns only artifacts where `persist=True`.                                                     |
| `get_artifact_paths(session_id, artifact_id)`                 | `list[Path]`         | Absolute paths of all files belonging to an artifact.                                            |
| `read_trace_csv(csv_file)`                                    | `tuple[list, list]`  | Parse a trace CSV, returning `(time_values, voltage_values)`. Skips `#` comment and header rows. |
| `export_hdf5(session_id, artifact_ids)`                       | `Path`               | Bundle selected traces into a single `.h5` file. Copies `unpack_hdf5.py` alongside it.          |

## Directory layout

```
{BUFFER_DIR}/
  {device_id}/
    {session_id}/
      index.json               ← per-session artifact registry (persist flags, metadata)
      trace_0001_ch1.csv       ← waveform data: 2 comment lines + header + time_s,voltage_V rows
      trace_0001_meta.json     ← instrument settings snapshot at acquisition time
      screenshot_0002.png      ← raw PNG from the oscilloscope display
      export_{session_id}.h5   ← HDF5 bundle (created on demand by export_hdf5)
      unpack_hdf5.py           ← self-contained extraction script (copied alongside .h5)
```

`BUFFER_DIR` defaults to `./buffer` and is set via the `BUFFER_DIR` environment variable.
