# `app/buffer/` — On-Disk Artifact Storage

Persists waveforms, screenshots, and HDF5 exports to the local file system and maintains a per-session index. Files flagged for long-term storage are later committed to OpenBIS by the sessions API.

## Files

### `service.py`

**`ArtifactInfo`** — one entry per stored artifact, persisted in `index.json`:

| Field            | Type          | Description                                                                                    |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `artifact_id`    | `str`         | E.g. `"trace_0001_ch1"` or `"screenshot_0002"`                                                 |
| `artifact_type`  | `str`         | `"trace"` or `"screenshot"`                                                                    |
| `channel`        | `int \| None` | 1-based channel number for traces; `None` for screenshots                                      |
| `seq`            | `int`         | Monotonically increasing sequence number within the session                                    |
| `persist`        | `bool`        | `True` → included in the next OpenBIS commit                                                   |
| `created_at`     | `str`         | ISO-8601 UTC timestamp                                                                         |
| `files`          | `list[str]`   | Filenames relative to the session dir (e.g. `["trace_0001_ch1.csv", "trace_0001_meta.json"]`)  |
| `acquisition_id` | `str \| None` | UUID shared by all channels captured in one `acquire` call; `None` for legacy/screenshots      |
| `annotation`     | `str \| None` | User-supplied label for the acquisition group (e.g. `"decay capacitor a"`)                     |
| `run_id`         | `str \| None` | UUID shared by all acquisitions of one series (RUN press); `None` for manual/single acquisitions |
| `uploaded`       | `bool`        | `True` after the artifact was committed to OpenBIS (or the dropbox); defaults to `False` for legacy entries |
| `uploaded_at`    | `str \| None` | ISO-8601 UTC timestamp of that commit                                                          |
| `perm_id`        | `str \| None` | OpenBIS permId of the dataset; `None` before upload and for dropbox commits                    |

**`SessionInfo`** (`session_id`, `device_id`, `owner_user`, `created_at`) — the `"session"` block of `index.json`; `owner_user`/`created_at` are `None` for legacy sessions. **`SessionRecord`** (`info`, `artifacts`) — one session with its artifacts, returned by `list_sessions()`.

**Thread safety:** All mutating methods (`register_session`, `store_waveform`, `store_screenshot`, `set_flag`, `set_annotation`, `mark_uploaded`) acquire a per-session `threading.Lock` around the `_load_index → mutate → _save_index` sequence, so concurrent calls from the thread pool cannot lose index updates. `_save_index` writes atomically via a `.tmp` file + `Path.replace()` (POSIX rename) to prevent readers from seeing partially written JSON. `_load_index` catches `JSONDecodeError` and returns an empty index with a warning log (handles legacy or truncated files).

**`BufferService`** — public methods:

| Method                                                                            | Returns              | Description                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store_waveform(device_id, session_id, waveform, meta, acquisition_id?, run_id?, created_at?)` | `str`                | Writes CSV + JSON sidecar; registers in `index.json`. Pass `acquisition_id` to link channels from the same call; pass `run_id` to group a series; pass `created_at` (ISO UTC) so all channels of a capture share one timestamp. |
| `register_session(device_id, session_id, owner_user)`                              | `SessionInfo`        | Writes the `"session"` block (called when the device lock is acquired). Keeps the first owner if called again. |
| `get_session_info(session_id)`                                                    | `SessionInfo \| None` | Ownership record, `None` if the session dir does not exist. Legacy sessions have `owner_user=None`. |
| `list_sessions()`                                                                 | `list[SessionRecord]` | Scans all `{device}/{session}/index.json`. |
| `get_artifacts(session_id, artifact_ids)`                                         | `list[ArtifactInfo]` | The named artifacts in request order. Raises `SessionNotFoundError` / `ArtifactNotFoundError`. |
| `mark_uploaded(session_id, artifact_ids, perm_id)`                                | `None`               | Sets `uploaded=True`, `uploaded_at`, `perm_id` and clears `persist` for the artifacts (called after a successful commit). |
| `new_temp_path(session_id, prefix, suffix)`                                       | `Path`               | Unique file path inside the session dir for on-demand downloads (deleted after sending). |
| `store_screenshot(device_id, session_id, png_bytes)`                              | `str`                | Writes PNG; registers in `index.json`. Returns `artifact_id`.                                                                                                                                                                                                                                                                                                                    |
| `list_artifacts(session_id)`                                                      | `list[ArtifactInfo]` | Returns all artifacts for the session. Searches across all device dirs. Empty list if not found.                                                                                                                                                                                                                                                                                 |
| `set_flag(session_id, artifact_id, persist)`                                      | `None`               | Toggle the `persist` flag. Raises `SessionNotFoundError` / `ArtifactNotFoundError`.                                                                                                                                                                                                                                                                                              |
| `set_annotation(session_id, acquisition_id, annotation)`                          | `None`               | Set annotation text on all artifacts sharing an `acquisition_id`. Raises `SessionNotFoundError` / `ArtifactNotFoundError`.                                                                                                                                                                                                                                                       |
| `get_trace_data(session_id, artifact_id)`                                         | `tuple[list, list]`  | Returns `(time_s, voltage_V)` for a trace artifact. Raises `SessionNotFoundError` / `ArtifactNotFoundError`.                                                                                                                                                                                                                                                                     |
| `get_screenshot_bytes(session_id, artifact_id)`                                   | `bytes`              | Returns raw PNG bytes for a screenshot artifact. Raises `SessionNotFoundError` / `ArtifactNotFoundError`.                                                                                                                                                                                                                                                                        |
| `get_flagged_artifacts(session_id)`                                               | `list[ArtifactInfo]` | Returns only artifacts where `persist=True`.                                                                                                                                                                                                                                                                                                                                     |
| `get_artifact_paths(session_id, artifact_id)`                                     | `list[Path]`         | Absolute paths of all files belonging to an artifact.                                                                                                                                                                                                                                                                                                                            |
| `read_trace_csv(csv_file)`                                                        | `tuple[list, list]`  | Parse a trace CSV, returning `(time_values, voltage_values)`. Skips `#` comment and header rows.                                                                                                                                                                                                                                                                                 |
| `export_hdf5(session_id, artifact_ids, dest?)`                                        | `Path`               | Bundle selected traces into a single `.h5` file. Channels sharing an `acquisition_id` are grouped under `/{acquisition_id}/ch{N}`; legacy ungrouped traces keep flat `/{artifact_id}` layout. Copies `unpack_hdf5.py` alongside.                                                                                                                                                 |
| `create_commit_zip(session_id, flagged, extra_content?, dest?)`                          | `Path`               | Compress flagged artifacts into `commit_{session_id}.zip`. Channels sharing an `acquisition_id` are merged into a single multi-column CSV (`time_s, ch1_voltage_V, ch2_voltage_V, …`). Annotation text is used as the filename (slugified, deduplicated with `_2`, `_3` suffixes). Pass `extra_content` to inject additional text files (e.g. `{"dataset_metadata.json": "…"}`). |

## Directory layout

```
{BUFFER_DIR}/
  {device_id}/
    {session_id}/
      index.json               ← per-session registry: {"session": {session_id, device_id, owner_user, created_at}, "artifacts": [...]}
                                  artifact entries: artifact_id, artifact_type, channel, seq, persist, created_at, files,
                                  acquisition_id, annotation, run_id, uploaded, uploaded_at, perm_id
                                  ("session" is missing in legacy sessions; the upload fields default to false/null)
      trace_0001_ch1.csv       ← waveform data: 2 comment lines + header + time_s,voltage_V rows
      trace_0001_meta.json     ← acquisition metadata: sample_rate, record_length, units, channel settings, timebase, trigger
      screenshot_0002.png      ← raw PNG from the oscilloscope display
      export_{session_id}.h5   ← HDF5 bundle (created on demand by export_hdf5)
      unpack_hdf5.py           ← self-contained extraction script (copied alongside .h5)
      commit_{session_id}.zip  ← compressed upload bundle (created on commit)
      download_*.zip, export_*.h5 ← temporary files of the download endpoints (removed after sending)
```

`BUFFER_DIR` defaults to `./buffer` and is set via the `BUFFER_DIR` environment variable.
