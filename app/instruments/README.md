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
`connect()`, `disconnect()`, `identify()`, `run()`, `stop()`, `acquire_waveform(channel)`, `get_screenshot()`, `get_channel_config(channel)`, `get_timebase()`, `get_trigger()`, `set_channel_config(channel, config)`, `set_timebase(config)`, `set_trigger(config)`

**Non-abstract methods provided by the base class:**

- `get_all_settings()` — assembles a full metadata dict from the abstract methods above.
- `get_available_channels() -> list[int]` — returns sorted list of enabled channel numbers by calling `get_channel_enabled()` for 1–4. Override if the instrument supports a batch query.
- `get_channel_enabled(channel) -> bool` — default calls `get_channel_config()`. Override in hardware drivers with a single lightweight query (e.g. `:CHANnelN:DISPlay?`) to avoid 4 unnecessary SCPI round-trips per disabled channel.

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
- `execute_command(device_id, cmd, ...)` — enqueues a command; the per-device worker picks it up and calls the driver method. Commands to different devices run in parallel; commands to the same device are serialized.
- `instantiate_driver(device_id)` — dynamically imports the driver class from the dotted path in config, or returns `MockOscilloscopeDriver` when `driver: "mock"`. Real drivers are always used regardless of `DEBUG` mode.
- `update_state(device_id, state)` — called by the health monitor and the app on state changes. Sets `entry.online_since` when transitioning to `ONLINE`; clears it on `OFFLINE`/`ERROR`.
- `shutdown()` — cancels all worker tasks, disconnects all drivers.

---

### `health_monitor.py`

`HealthMonitor` runs a background task that periodically opens a TCP connection to each device to check reachability.

| Transition                      | Trigger                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `OFFLINE` → `ONLINE`            | TCP connect succeeds; driver is instantiated and connected  |
| `ERROR` → `ONLINE`              | Same as above                                               |
| `ONLINE` / `LOCKED` → `OFFLINE` | TCP connect fails; driver is disconnected and set to `None` |

The check interval is controlled by `HEALTH_CHECK_INTERVAL_SECONDS` (default 5 s). The TCP connection timeout is controlled by `HEALTH_CHECK_TCP_TIMEOUT_SECONDS` (default 2.0 s).

Poll cycles are skipped when no API request has been seen within `HEALTH_CHECK_IDLE_TIMEOUT_SECONDS` seconds. Setting it to `0` disables idle suppression entirely (checks always run). The first cycle on startup always runs regardless of idle state.

The monitor is **always started**, including in `DEBUG=True` mode. Devices configured with `driver: "mock"` are skipped entirely (they are pre-connected at startup and have no real network endpoint). Real hardware devices are monitored in all modes.

---

### `mock_driver.py`

`MockOscilloscopeDriver` — a fully functional `BaseOscilloscopeDriver` that returns synthetic sine-wave data without real hardware. Used automatically in `DEBUG=True` mode and in tests.

- All four channels are enabled by default so every acquire in `DEBUG=True` mode returns CH1–CH4 without any extra configuration.
- When `run()` is called, `acquire_waveform()` uses `time.time()` as a phase offset so successive calls return different waveform snapshots (simulates a live scope).
- When `stop()` is called, the stop timestamp is recorded and all subsequent `acquire_waveform()` calls return the same frozen waveform until `run()` is called again.
- The waveform window respects the stored `_timebase.scale_s_div` (10 divisions wide), so applying a new timebase from the UI is reflected in subsequent acquisitions.
- Sine amplitude is `scale_v_div × 3` so the waveform fills roughly 3 vertical divisions per channel.
- Noise uses a shared `np.random.default_rng` instance (seeded once at construction) so noise varies between acquisitions when running and is frozen when stopped.
- `get_screenshot()` returns a cached 640×480 white PNG (built once via `_get_blank_png()`, not regenerated on every call).

---

### `driver_rigolDS1000.py`

`RigolDS1000Driver` — concrete `BaseOscilloscopeDriver` for the Rigol DS1000Z family. Wraps `RigolDS1000ZSeries` from `pymeasure_rigol_ds1000.py` and adapts it to the project driver interface.

| Method                        | Implementation notes                                                                                                                                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()` / `disconnect()`  | Delegates to `instrument.adapter.open()` / `.close()`. pymeasure opens the adapter at construction. `connect()` wraps `open()` in a `ConnectionError` on failure.                                                                                                                               |
| `identify()`                  | Returns `InstrumentInfo` from `*IDN?`; firmware is the 4th comma-separated field.                                                                                                                                                                                                               |
| `run()` / `stop()`            | Direct pass-through to `instrument.run()` / `.stop()`.                                                                                                                                                                                                                                          |
| `acquire_waveform(channel)`   | Validates channel 1–4. Sets source to `CHAN{n}`, reads RAW/BYTE waveform; time array built as `xorigin + (arange(n) - xreference) * xincrement` (xreference is a sample index). Calls `run()` after read to restart acquisition. Raises `ValueError` if channel out of range or xincrement ≤ 0. |
| `get_screenshot()`            | Returns raw image bytes from `instrument.get_display_data()`.                                                                                                                                                                                                                                   |
| `get_channel_config(ch)`      | Reads `ch{n}.scale`, `.offset`, `.coupling`, `.probe_ratio`, `.is_enabled`.                                                                                                                                                                                                                     |
| `get_timebase()`              | Reads `timebase_scale`, `timebase_offset`, `acq_sample_rate`.                                                                                                                                                                                                                                   |
| `get_trigger()`               | Reads edge trigger properties; maps slopes (`POS`→`RISE`, `NEG`→`FALL`, `RFAL`→`EITHER`) and sweep modes (`NORM`→`NORMAL`, `SING`→`SINGLE`).                                                                                                                                                    |
| `set_channel_config(ch, cfg)` | Writes `ch{n}.is_enabled`, `.scale`, `.offset`, `.coupling`, `.probe_ratio`.                                                                                                                                                                                                                    |
| `set_timebase(cfg)`           | Writes `timebase_scale` and `timebase_offset`. `sample_rate` is read-only on the instrument and is ignored.                                                                                                                                                                                     |
| `set_trigger(cfg)`            | Reverse-maps slope/mode to SCPI values; normalises `CH1` → `CHAN1`; writes edge source, level, slope, and sweep mode.                                                                                                                                                                           |

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
| `get_waveform_data(raw=False)`                     | Returns voltage array (or raw bytes if `raw=True`). Uses `adapter.connection.read_raw()` to avoid ASCII decode errors on binary BYTE/WORD payloads. |
| `get_display_data()`                               | Returns screenshot bytes in the format set by `storage_image_type`                                                                                  |
| `run()`, `stop()`                                  | Start / stop acquisition                                                                                                                            |
