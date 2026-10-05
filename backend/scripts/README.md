# `backend/scripts/` — Utility Scripts

One-off helper scripts for working with data produced by the service.

## `unpack_hdf5.py`

Reads an HDF5 file exported by `BufferService.export_hdf5()` and prints a human-readable summary of its contents.

**Usage:**

```bash
python scripts/unpack_hdf5.py path/to/session.h5
```

**Output:** For each dataset in the file, prints the channel number, number of samples, time range, voltage range, and all metadata attributes (sample rate, timebase scale, trigger settings, etc.).

The HDF5 layout produced by `BufferService`:

```
session.h5
  /channel_1/
    time       ← float64 array, seconds
    voltage    ← float64 array, volts
    attrs:     sample_rate, scale_v_div, offset_v, coupling, …
  /channel_2/
    …
```

## `load_test.py`

Concurrent load test that drives the API over HTTP against a **running service instance** pointed at real oscilloscope hardware (`DEBUG=False`, real Redis, real drivers). Not a pytest suite — it doesn't spin up the app itself.

Three modes:

- **Acquire load** (default): for each device, `rounds` cycles of lock → `POST /acquire` (`max_samples=true` by default, so full-memory-depth "MAX" transfers) → optional `GET .../data` per channel → unlock. All devices run concurrently, so this is the "many real scopes pulling MAX waveforms at once" test — it stresses the LAN/VXI-11 link to each instrument and the service's `asyncio.to_thread` pool, not just the API layer.
- **Lock contention** (`--contention N`): fires `N` concurrent `POST /lock` at one device (optionally split across two Bearer tokens via `--token2`, to simulate two different users/browser tabs racing for the same scope) and asserts exactly one wins. Regression check for the lock-conflict path documented in `app/api/README.md`.
- **Dry run** (`--dry-run`): cheap `GET /probe` connectivity check only, no locking or acquisition — safe to run anytime.

**Usage:**

```bash
python scripts/load_test.py --base-url http://host:8000 --token <bearer>
python scripts/load_test.py --devices scope-01,scope-02 --rounds 3 --fetch-data
python scripts/load_test.py --dry-run
python scripts/load_test.py --contention 3 --token2 <bearer-of-second-user>
```

`--token`/`--base-url`/`--token2` can also come from `OSC_TOKEN`/`OSC_BASE_URL`/`OSC_TOKEN2`. Defaults to all devices from `GET /devices` when `--devices` is omitted. Prompts for confirmation before touching real hardware unless `-y`/`--yes` is passed (refuses to run unattended without it). Any lock it acquires is released in a `finally` block, including on Ctrl-C. Exits non-zero if any request failed.

**Reports.** All status/progress text (target, device list, confirmation prompt, wall clock) goes to **stderr**. The report itself is the only thing written to **stdout**, in one of three formats via `--format {text,json,csv}` (default `text`), so it pipelines directly into a file:

```bash
python scripts/load_test.py --token <bearer> --format json > report.json
python scripts/load_test.py --token <bearer> --format csv > report.csv
```

`--output PATH` writes the same rendered report to a file in addition to stdout (handy when running interactively and still wanting a saved copy). On Ctrl-C, a partial report covering whatever rounds completed is still emitted before exit.

Per phase (`lock`, `acquire`, `fetch_data`, `unlock`, `probe`, `contention`) the report gives `n`/`ok`/`fail` counts and latency stats — `mean`, `median`, `stdev`, `min`, `max`, `p50`, `p90`, `p95`, `p99` — plus, for `fetch_data` (which is where the actual waveform payload moves), a `throughput` block: total samples and bytes transferred, mean samples/sec per request, and aggregate samples/sec and KB/s across the whole phase. The `json` format additionally includes the full raw per-request rows (`round`, `phase`, `ok`, `seconds`, `samples`, `bytes`, `detail`); `csv` is exactly those raw rows, one per line, for loading into pandas/Excel for further analysis.
