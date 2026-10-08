# `app/instruments/` — Hardware Interface Layer

Manages the full lifecycle of oscilloscope connections: driver loading, per-device command serialization, TCP health checking, and the abstract driver contract.

## Files

### `base_driver.py`

Abstract base class every driver must subclass, plus the data classes used as return types and the hooks for optional capabilities. (`MockOscilloscopeDriver` no longer lives here; `from app.instruments.base_driver import MockOscilloscopeDriver` still works through a lazy re-export of `mock_driver.py`.)

**Data classes:**

| Class            | Fields                                                                                       | Description                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `WaveformData`   | `channel`, `time_array`, `voltage_array`, `sample_rate`, `record_length`, `unit_x`, `unit_y` | One acquired waveform. Arrays are 1-D NumPy float64.                                        |
| `ChannelConfig`  | `channel`, `enabled`, `scale_v_div`, `offset_v`, `coupling`, `probe_attenuation`             | Snapshot of a channel's current settings.                                                   |
| `TimebaseConfig` | `scale_s_div`, `offset_s`, `sample_rate`                                                     | Horizontal timebase state.                                                                  |
| `TriggerConfig`  | `source`, `level_v`, `slope`, `mode`                                                         | Trigger configuration. `slope` ∈ `{RISE, FALL, EITHER}`, `mode` ∈ `{AUTO, NORMAL, SINGLE}`. |
| `InstrumentInfo` | `idn`, `ip`, `firmware`                                                                      | Identity string and parsed firmware version.                                                |

**Abstract methods every driver must implement:**
`connect()`, `disconnect()`, `identify()`, `run()`, `stop()`, `acquire_waveform(channel)`, `get_screenshot()`, `get_channel_config(channel)`, `get_timebase()`, `get_trigger()`, `set_channel_config(channel, config)`, `set_timebase(config)`, `set_trigger(config)`, `get_memory_depth()`

**Non-abstract methods provided by the base class:**

- `get_all_settings()` — assembles a full metadata dict from the abstract methods above.
- `get_available_channels() -> list[int]` — returns sorted list of enabled channel numbers by calling `get_channel_enabled()` for 1–4. Override if the instrument supports a batch query.
- `get_channel_enabled(channel) -> bool` — default calls `get_channel_config()`. Override in hardware drivers with a single lightweight query (e.g. `:CHANnelN:DISPlay?`) to avoid 4 unnecessary SCPI round-trips per disabled channel.
- `acquire_waveform_max(channel) -> WaveformData` — default falls back to `acquire_waveform(channel, max_samples=False)`.

**Class attributes:** `channel_count` (default `4`; used by `get_available_channels`, `get_all_settings`, the settings endpoint and channel validation) and `supports_cancel_acquire` (default `False`).

**Optional capabilities** (non-abstract, "unsupported by default"):

| Member                                  | Purpose                                                                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `single()`                              | Arm a single acquisition. Overriding it adds capability `single`.                                                                                                                                     |
| `force_trigger()`                       | Force a trigger now. Capability `force_trigger`.                                                                                                                                                      |
| `autoscale()`                           | Auto-Setup; should block until the scope settled. Capability `autoscale`.                                                                                                                             |
| `capabilities` (property)               | `["run","stop","acquire","preview","screenshot"]` + `single` / `force_trigger` / `autoscale` for every method the subclass overrides + `cancel_acquire` if `supports_cancel_acquire` is `True`. Reported by `GET /devices/{id}`; the router has no hard-coded list. |
| `report_progress(done, total)`          | Call after each block of a long read (points done / total for the current channel). No-op unless the endpoint bound a hook.                                                                            |
| `raise_if_cancelled()`                  | Call between blocks; raises `AcquisitionCancelledError` (HTTP 409 `acquisition_cancelled`) when the user cancelled. Restore instrument state (e.g. `RUN`) in a `finally`.                              |
| `bind_job_hooks()` / `unbind_job_hooks()` | Used by `read_frame()` in the acquire endpoint to attach the progress callback and cancel `threading.Event` for one channel read. Drivers do not call them.                                          |

A driver that calls `report_progress` / `raise_if_cancelled` in its block loop should set `supports_cancel_acquire = True`.

---

### `manager.py`

`InstrumentManager` owns all runtime device state.

**Key types:**

| Type           | Description                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `DeviceState`  | Enum: `OFFLINE`, `ONLINE`, `LOCKED`, `BUSY`, `ERROR`                                                |
| `DeviceConfig` | Loaded from `oscilloscopes.yaml`: `id`, `ip`, `port`, `label`, `driver` (dotted import path)        |
| `DeviceEntry`  | Runtime state: `config`, `state`, `driver` instance, `asyncio.Queue`, worker `Task`, `online_since` |
| `DeviceStatus` | API response shape: includes `online_since_utc` (ISO-8601) and `uptime_minutes` (float or None)     |

**Lifecycle:**

- `startup()` — reads `oscilloscopes.yaml`, creates a `DeviceEntry` per device, spawns one `asyncio` worker task per device.
- `execute_command(device_id, cmd, ...)` — enqueues a command on a bounded `asyncio.Queue(maxsize=32)`; raises `AppError(503, ..., "queue_full")` when full. The per-device worker picks it up and calls the driver method. Commands to different devices run in parallel; commands to the same device are serialized. On `TimeoutError`, a `timed_out` flag is set on the queue item so the worker skips restoring the previous state after the shielded coroutine completes.
- `instantiate_driver(device_id)` — dynamically imports the driver class from the dotted path in config, or returns `MockOscilloscopeDriver` (from `mock_driver.py`) when `driver: "mock"`. Real drivers are always used regardless of `DEBUG` mode.
- `update_state(device_id, state)` — called by the health monitor and the app on state changes. Sets `entry.online_since` when transitioning to `ONLINE`; clears it on `OFFLINE`/`ERROR`. Publishes a `device_state` event to `event_bus` if one is attached.
- `jobs` — an `AcquireJobRegistry` (see `jobs.py`) tracking the acquire in flight per device so it can be cancelled without going through the device queue.
- `shutdown()` — cancels all worker tasks, disconnects all drivers.

**`event_bus`** — optional `EventBus` instance (attached at startup via `app.main`). When set, `update_state` publishes `{"type": "device_state", "device_id": ..., "state": ..., "last_error": ...}` for SSE consumers.

---

### `health_monitor.py`

`HealthMonitor` runs a background task that periodically opens a TCP connection to each device to check reachability.

| Transition                      | Trigger                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `OFFLINE` → `ONLINE`            | TCP connect succeeds; driver is instantiated and connected  |
| `ERROR` → `ONLINE`              | Same as above                                               |
| `ONLINE` / `LOCKED` → `OFFLINE` | TCP connect fails; driver is disconnected and set to `None` |

Per-device checks run concurrently via `asyncio.gather` so one stalled scope cannot delay others. `driver.connect()` and `driver.identify()` are offloaded to a thread pool via `asyncio.to_thread`.

The check interval is controlled by `HEALTH_CHECK_INTERVAL_SECONDS` (default 5 s). The TCP connection timeout is controlled by `HEALTH_CHECK_TCP_TIMEOUT_SECONDS` (default 2.0 s).

Poll cycles are skipped when no API request has been seen within `HEALTH_CHECK_IDLE_TIMEOUT_SECONDS` seconds. Setting it to `0` disables idle suppression entirely (checks always run). The first cycle on startup always runs regardless of idle state.

The monitor is **always started**, including in `DEBUG=True` mode. Devices configured with `driver: "mock"` are skipped entirely (they are pre-connected at startup and have no real network endpoint). Real hardware devices are monitored in all modes.

---

### `jobs.py`

`AcquireJob` (`device_id`, `session_id`, `cancel_event: threading.Event`, `cancelled`) and `AcquireJobRegistry` (`start`, `finish`, `cancel(device_id, session_id) -> bool`). The acquire endpoint registers a job **before** queueing the work; `POST …/acquire/cancel` only sets the job's event, which the driver observes through `raise_if_cancelled()`. A cancelled acquire returns `None` from the worker coroutine (so the device does not enter `ERROR`) and the endpoint raises `AcquisitionCancelledError`.

---

### `mock_driver.py`

`MockOscilloscopeDriver` — the single mock implementation (the former duplicate in `base_driver.py` was removed). A fully functional `BaseOscilloscopeDriver` for `DEBUG=True` mode and tests that behaves like a scope connected to a signal generator + RC low-pass:

| Channel | Signal                                          |
| ------- | ----------------------------------------------- |
| CH1     | 1 kHz sine, 2 Vpp (phase reference)             |
| CH2     | 1 kHz sine, 1 Vpp, 45° lag behind CH1 (RC out)  |
| CH3     | 500 Hz square, 3 Vpp                            |
| CH4     | 2 kHz triangle, 2 Vpp                           |

- Gaussian noise σ = 5 mV; no wall-clock animation, so measurements (Vpp, frequency, phase) are reproducible.
- **Settings change what is read:** the time axis spans `10 × scale_s_div` centred on `offset_s`; normal reads return 1200 samples (`sample_rate = 1200 / window`); the trigger (source/level/slope) shifts the waveform so the selected edge sits at `t = 0` (AUTO mode free-runs with a fixed random phase if the level is never crossed); a channel's `scale_v_div`/`offset_v` clip the trace at ±5 divisions around the offset; `coupling="GND"` reads 0 V; disabled channels are not returned by `get_available_channels()`.
- Defaults: all channels enabled at 1 V/div, 500 µs/div (five 1 kHz periods on screen), CH1 rising, 0 V, AUTO.
- `max_samples=True` returns `max_depth` samples (default 300 000), generated in blocks of `block_size` with `block_delay_s` (default 0.1 s) sleep per block, calling `report_progress` and `raise_if_cancelled()` between blocks, so progress bar and cancel can be tried without hardware. Constructor arguments let tests shrink or slow this down.
- `single()` (trigger mode → `SINGLE`, scope stops), `force_trigger()`, `autoscale()` (200 µs/div, 1-2-5 volts/div per channel, all channels on, CH1 trigger) are implemented; every run/stop/single/force_trigger/autoscale call is appended to `command_log`. `supports_cancel_acquire = True`.
- `get_memory_depth()` returns `max_depth`. `get_screenshot()` returns a cached 640×480 white PNG.

---

### `driver_rigolDS1000.py`

`RigolDS1000Driver` — concrete `BaseOscilloscopeDriver` for the Rigol DS1000Z family. Wraps `RigolDS1000ZSeries` from `pymeasure_rigol_ds1000.py` and adapts it to the project driver interface.

| Method                                       | Implementation notes                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()` / `disconnect()`                 | Delegates to `instrument.adapter.open()` / `.close()`. pymeasure opens the adapter at construction. `connect()` wraps `open()` in a `ConnectionError` on failure.                                                                                                                               |
| `identify()`                                 | Returns `InstrumentInfo` from `*IDN?`; firmware is the 4th comma-separated field.                                                                                                                                                                                                               |
| `run()` / `stop()`                           | Direct pass-through to `instrument.run()` / `.stop()`.                                                                                                                                                                                                                                          |
| `acquire_waveform(channel, max_samples)`     | Validates channel 1–4. Sets source to `CHAN{n}`, reads BYTE data; time array built as `xorigin + (arange(n) - xreference) * xincrement` (xreference is a sample index). A normal (`NORM`) read leaves the run state untouched. With `max_samples` the scope is stopped and its keys locked, the full memory is read in 250 k-point SCPI blocks via `get_waveform_data(progress_callback=…)` (each block calls `report_progress` and `raise_if_cancelled`), and in a `finally` the keys are unlocked and `RUN` restored — also after a cancel. Raises `ValueError` if channel out of range or xincrement ≤ 0. |
| `acquire_waveform_max(channel)`              | Delegates to `acquire_waveform(channel, max_samples=True)`.                                                                                                                                                                                                                                      |
| `single()`                                   | `:SINGle`.                                                                                                                                                                                                                                                                                       |
| `force_trigger()`                            | `:TFORce` (via `instrument.force_trigger()`).                                                                                                                                                                                                                                                    |
| `autoscale(timeout_s=20)`                    | `:AUToscale`, then polls `*OPC?` (tolerating VISA timeouts) until the scope settled; raises `TimeoutError` otherwise.                                                                                                                                                                           |
| `get_screenshot()`                           | Returns raw image bytes from `instrument.get_display_data()`.                                                                                                                                                                                                                                   |
| `get_channel_config(ch)`                     | Reads `ch{n}.scale`, `.offset`, `.coupling`, `.probe_ratio`, `.is_enabled`.                                                                                                                                                                                                                     |
| `get_timebase()`                             | Reads `timebase_scale`, `timebase_offset`, `acq_sample_rate`.                                                                                                                                                                                                                                   |
| `get_trigger()`                              | Reads edge trigger properties; maps slopes (`POS`→`RISE`, `NEG`→`FALL`, `RFAL`→`EITHER`) and sweep modes (`NORM`→`NORMAL`, `SING`→`SINGLE`).                                                                                                                                                    |
| `set_channel_config(ch, cfg)`                | Writes `ch{n}.is_enabled`, `.scale`, `.offset`, `.coupling`, `.probe_ratio`.                                                                                                                                                                                                                    |
| `set_timebase(cfg)`                          | Writes `timebase_scale` and `timebase_offset`. `sample_rate` is read-only on the instrument and is ignored.                                                                                                                                                                                     |
| `set_trigger(cfg)`                           | Reverse-maps slope/mode to SCPI values; normalises `CH1` → `CHAN1`; writes edge source, level, slope, and sweep mode.                                                                                                                                                                           |
| `get_memory_depth()`                         | Queries the waveform preamble for the current source and returns the `points` field — the number of samples in acquisition memory.                                                                                                                                                              |

---

### `pymeasure_rigol_ds1000.py`

PyMeasure-based SCPI driver for the Rigol DS1000Z family (`OscilloscopeChannel` channel class + `RigolDS1000ZSeries` instrument class). This file is the low-level SCPI implementation; it is wrapped by `driver_rigolDS1000.py` which adapts it to the `BaseOscilloscopeDriver` interface.

Key properties exposed on `RigolDS1000ZSeries`:

| Property / Method                                  | Description                                                                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ch1`–`ch4`                                        | `OscilloscopeChannel` instances (scale, offset, coupling, probe_ratio, is_enabled, …)                                                               |
| `timebase_scale`, `timebase_offset`                | Horizontal scale (s/div) and offset                                                                                                                 |
| `acq_sample_rate`                                  | Current sample rate (read-only)                                                                                                                     |
| `trigger_edge_source/slope/level`, `trigger_sweep` | Edge trigger settings                                                                                                                               |
| `waveform_source/mode/format`                      | Waveform readout configuration                                                                                                                      |
| `get_waveform_preamble()`                          | Returns dict with `xincrement`, `xorigin`, `yincrement`, `yorigin`, `yreference`, `points`                                                          |
| `get_waveform_data(raw=False, return_preamble=False, progress_callback=None)` | Returns voltage array (or raw bytes if `raw=True`), reading in 250 k-point batches. `progress_callback(done, total)` is called before the first and after every batch and may raise to abort. Uses `adapter.connection.read_raw()` to avoid ASCII decode errors on binary payloads. |
| `get_display_data()`                               | Returns screenshot bytes in the format set by `storage_image_type`                                                                                  |
| `run()`, `stop()`                                  | Start / stop acquisition                                                                                                                            |
