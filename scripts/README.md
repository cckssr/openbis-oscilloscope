# `scripts/` — Utility Scripts

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
