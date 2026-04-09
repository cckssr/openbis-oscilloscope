# `app/instruments/` — Hardware Interface Layer

Manages the full lifecycle of oscilloscope connections: driver loading, per-device command serialization, TCP health checking, and the abstract driver contract.

## Files

### `base_driver.py`

Abstract base class every driver must subclass, plus the data classes used as return types.

**Data classes:**

| Class            | Fields                                                                                       | Description                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `WaveformData`   | `channel`, `time_array`, `voltage_array`, `sample_rate`, `record_length`, `unit_x`, `unit_y` | One acquired waveform. Arrays are 1-D NumPy float64.                                        |
| `ChannelConfig`  | `channel`, `enabled`, `scale_v_div`, `offset_v`, `coupling`, `probe_attenuation`             | Snapshot of a channel's current settings.                                                   |
| `TimebaseConfig` | `scale_s_div`, `offset_s`, `sample_rate`                                                     | Horizontal timebase state.                                                                  |
| `TriggerConfig`  | `source`, `level_v`, `slope`, `mode`                                                         | Trigger configuration. `slope` ∈ `{RISE, FALL, EITHER}`, `mode` ∈ `{AUTO, NORMAL, SINGLE}`. |
| `InstrumentInfo` | `idn`, `ip`, `firmware`                                                                      | Identity string and parsed firmware version.                                                |

**Abstract methods every driver must implement:**
`connect()`, `disconnect()`, `identify()`, `run()`, `stop()`, `acquire_waveform(channel)`, `get_screenshot()`, `get_channel_config(channel)`, `get_timebase()`, `get_trigger()`

`get_all_settings()` is provided by the base class — it assembles a metadata dict from the above methods automatically.

---

### `manager.py`

`InstrumentManager` owns all runtime device state.

**Key types:**

| Type           | Description                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------- |
| `DeviceState`  | Enum: `OFFLINE`, `ONLINE`, `LOCKED`, `BUSY`, `ERROR`                                         |
| `DeviceConfig` | Loaded from `oscilloscopes.yaml`: `id`, `ip`, `port`, `label`, `driver` (dotted import path) |
| `DeviceEntry`  | Runtime state: `config`, `state`, `driver` instance, `asyncio.Queue`, worker `Task`          |
| `DeviceStatus` | API response shape for a device (state, label, lock info, capabilities)                      |

**Lifecycle:**

- `startup()` — reads `oscilloscopes.yaml`, creates a `DeviceEntry` per device, spawns one `asyncio` worker task per device.
- `execute_command(device_id, cmd, ...)` — enqueues a command; the per-device worker picks it up and calls the driver method. Commands to different devices run in parallel; commands to the same device are serialized.
- `instantiate_driver(device_id)` — dynamically imports the driver class from the dotted path in config, or returns `MockOscilloscopeDriver` when `driver: "mock"` or `DEBUG=True`.
- `update_state(device_id, state)` — called by the health monitor and the app on state changes.
- `shutdown()` — cancels all worker tasks, disconnects all drivers.

---

### `health_monitor.py`

`HealthMonitor` runs a background task that periodically opens a TCP connection to each device to check reachability.

| Transition                      | Trigger                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `OFFLINE` → `ONLINE`            | TCP connect succeeds; driver is instantiated and connected  |
| `ERROR` → `ONLINE`              | Same as above                                               |
| `ONLINE` / `LOCKED` → `OFFLINE` | TCP connect fails; driver is disconnected and set to `None` |

The check interval is controlled by `HEALTH_CHECK_INTERVAL_SECONDS` (default 5 s). The monitor is skipped entirely in `DEBUG=True` mode.

---

### `mock_driver.py`

`MockOscilloscopeDriver` — a fully functional `BaseOscilloscopeDriver` that returns deterministic dummy data without real hardware. Used automatically in `DEBUG=True` mode and in tests.

---

### `pymeasure_rigol_ds1000.py`

PyMeasure-based SCPI driver for the Rigol DS1000Z family (`OscilloscopeChannel` channel class + `RigolDS1000ZSeries` instrument class). This file is the low-level SCPI implementation; it is wrapped by `drivers/RigolDS1000.py` which adapts it to the `BaseOscilloscopeDriver` interface.

Key properties exposed on `RigolDS1000ZSeries`:

| Property / Method                                  | Description                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ch1`–`ch4`                                        | `OscilloscopeChannel` instances (scale, offset, coupling, probe_ratio, is_enabled, …)      |
| `timebase_scale`, `timebase_offset`                | Horizontal scale (s/div) and offset                                                        |
| `acq_sample_rate`                                  | Current sample rate (read-only)                                                            |
| `trigger_edge_source/slope/level`, `trigger_sweep` | Edge trigger settings                                                                      |
| `waveform_source/mode/format`                      | Waveform readout configuration                                                             |
| `get_waveform_preamble()`                          | Returns dict with `xincrement`, `xorigin`, `yincrement`, `yorigin`, `yreference`, `points` |
| `get_waveform_data(raw=False)`                     | Returns voltage array (or raw bytes if `raw=True`)                                         |
| `get_display_data()`                               | Returns screenshot bytes in the format set by `storage_image_type`                         |
| `run()`, `stop()`                                  | Start / stop acquisition                                                                   |
