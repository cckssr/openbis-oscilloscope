# `scripts/` — Utility Scripts

One-off helper scripts for working with data produced by the service.

## `smoke_test_hardware.py`

Exercises every API endpoint against a single real device and prints a `✓ / ✗` summary. No pytest dependency — run it directly against a live `uvicorn` server. Useful when integrating a new driver class or verifying a fresh deployment.

**Usage:**

```bash
python scripts/smoke_test_hardware.py \
    --base-url http://127.0.0.1:8000 \
    --token $OPENBIS_TOKEN \
    --device scope-01
```

**What it tests:** health, auth, device listing, probe, settings, lock/heartbeat/unlock, channel config, timebase, trigger, run/stop, acquire, channel data, screenshot (GET + POST save), and all admin endpoints. Exits non-zero on any failure.

**In DEBUG mode** use `--token debug-token`.

---

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
