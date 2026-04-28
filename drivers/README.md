# Writing a custom oscilloscope driver

This directory contains the custom driver(s) for your oscilloscope model. Drivers bridge the abstract `BaseOscilloscopeDriver` interface and your instrument's SCPI command set.

## Available drivers

| File                 | Class         | Hardware                                                                                                                                                                                  |
| -------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RigolDS1000.py`     | `RigolDS1000` | Rigol DS1000Z series (DS1054Z, DS1074Z, DS1104Z, MSO variants). Full read/write driver using PyMeasure over VXI-11 (`TCPIP::ip::INSTR`). Set `port: 111` in the YAML (VXI-11 portmapper). |
| `my_oscilloscope.py` | —             | Annotated stub — copy this to add a new driver.                                                                                                                                           |

---

## 1. Start from the stub

`my_oscilloscope.py` is a fully annotated stub. Copy it, rename the class, and fill in the `TODO` sections:

```bash
cp my_oscilloscope.py drivers/rigol_ds1054z.py
```

## 2. Implement the required methods

Every driver must implement these abstract methods:

| Method                                         | Description                                  |
| ---------------------------------------------- | -------------------------------------------- |
| `connect()`                                    | Open connection (VISA, raw TCP socket, etc.) |
| `disconnect()`                                 | Close connection                             |
| `identify() -> InstrumentInfo`                 | Query `*IDN?`, return make/model/firmware    |
| `run()`                                        | Start continuous acquisition                 |
| `stop()`                                       | Stop acquisition                             |
| `acquire_waveform(channel) -> WaveformData`    | Transfer waveform data                       |
| `get_screenshot() -> bytes`                    | Capture screen as PNG bytes                  |
| `get_channel_config(channel) -> ChannelConfig` | Query channel settings                       |
| `get_timebase() -> TimebaseConfig`             | Query timebase settings                      |
| `get_trigger() -> TriggerConfig`               | Query trigger settings                       |

`get_all_settings()` and `get_channel_enabled(channel)` are provided by the base class. Override `get_channel_enabled()` with a single `:CHANnelN:DISPlay?` query to avoid reading the full config for disabled channels during acquire pre-screening — saves 4 round-trips per inactive channel.

Override `acquire_waveform_max(channel, progress_cb)` to implement full-memory-depth reading (e.g. MAX/RAW waveform mode with batched SCPI transfers). The base class provides a fallback that calls `acquire_waveform()` with a single progress event. `progress_cb(completed, total)` may be called from a worker thread — use `loop.call_soon_threadsafe` if the callback touches asyncio objects.

## 3. LAN / SCPI connection

For LAN-connected instruments (SCPI over TCP port 5025), the simplest approach is a raw socket or PyVISA with the TCPIP resource string:

```python
import pyvisa

rm = pyvisa.ResourceManager()
self._resource = rm.open_resource(f"TCPIP::{self.ip}::INSTR")
self._resource.timeout = 10_000  # ms
```

No VISA runtime is needed for LAN-only operation if you use a raw socket instead:

```python
import socket

self._sock = socket.create_connection((self.ip, self.port), timeout=10)
self._sock.sendall(b"*IDN?\n")
idn = self._sock.recv(4096).decode().strip()
```

## 4. Register the driver

Add an entry to `config/oscilloscopes.yaml`:

```yaml
oscilloscopes:
  - id: "scope-lab2"
    ip: "192.168.1.101"
    port: 5025
    label: "Rigol DS1054Z"
    driver: "drivers.rigol_ds1054z.RigolDS1054Z"
```

The `driver` field is a Python dotted import path. The class is loaded dynamically at startup.

## 5. Waveform data format

`acquire_waveform` must return a `WaveformData` with:

- `time_array` — 1-D NumPy float64 array of sample times in seconds
- `voltage_array` — 1-D NumPy float64 array of voltages in volts
- `sample_rate` — samples per second (float)
- `record_length` — number of samples (int)
- `unit_x`, `unit_y` — axis units, default `"s"` and `"V"`

## 6. Tips

- **Waveform preamble**: Most SCPI oscilloscopes return a preamble with `x_increment`, `x_origin`, `y_increment`, `y_origin`, and `y_reference`. Use these to convert raw ADC counts to physical values.
- **Timeout**: Set instrument timeout > expected acquisition time. Single-shot triggers may take seconds.
- **Binary transfer**: Use `:WAVeform:FORMat BYTE` or `WORD` for speed; `ASCII` is slow for long records.
- **Thread safety**: The instrument manager serialises all calls through a per-device asyncio queue, so you do not need to add your own locking inside the driver.

## Example: minimal Keysight DSOX driver skeleton

```python
import numpy as np
from app.instruments.base_driver import (
    BaseOscilloscopeDriver, WaveformData, ChannelConfig,
    TimebaseConfig, TriggerConfig, InstrumentInfo,
)

class KeysightDSOX(BaseOscilloscopeDriver):
    def connect(self):
        import pyvisa
        rm = pyvisa.ResourceManager()
        self._r = rm.open_resource(f"TCPIP::{self.ip}::INSTR")
        self._r.timeout = 15_000

    def disconnect(self):
        self._r.close()

    def identify(self):
        idn = self._r.query("*IDN?").strip()
        parts = idn.split(",")
        return InstrumentInfo(idn=idn, ip=self.ip, firmware=parts[3] if len(parts) > 3 else "")

    def run(self):
        self._r.write(":RUN")

    def stop(self):
        self._r.write(":STOP")

    def acquire_waveform(self, channel: int) -> WaveformData:
        self._r.write(f":WAV:SOUR CHAN{channel}")
        self._r.write(":WAV:FORM BYTE")
        pre = self._r.query(":WAV:PRE?").split(",")
        xinc, xorig = float(pre[4]), float(pre[5])
        yinc, yorig, yref = float(pre[7]), float(pre[8]), float(pre[9])
        raw = self._r.query_binary_values(":WAV:DATA?", datatype="B", is_big_endian=True)
        v = (np.array(raw, dtype=float) - yref - yorig) * yinc
        t = np.arange(len(raw)) * xinc + xorig
        return WaveformData(channel=channel, time_array=t, voltage_array=v,
                            sample_rate=1/xinc, record_length=len(raw))

    def get_screenshot(self) -> bytes:
        return self._r.query_binary_values(":DISP:DATA? PNG", datatype="B", is_big_endian=True,
                                            container=bytes)

    def get_channel_config(self, channel: int) -> ChannelConfig:
        enabled = self._r.query(f":CHAN{channel}:DISP?").strip() == "1"
        scale = float(self._r.query(f":CHAN{channel}:SCAL?"))
        offset = float(self._r.query(f":CHAN{channel}:OFFS?"))
        coupling = self._r.query(f":CHAN{channel}:COUP?").strip()
        probe = float(self._r.query(f":CHAN{channel}:PROB?"))
        return ChannelConfig(channel=channel, enabled=enabled, scale_v_div=scale,
                             offset_v=offset, coupling=coupling, probe_attenuation=probe)

    def get_timebase(self) -> TimebaseConfig:
        scale = float(self._r.query(":TIM:SCAL?"))
        offset = float(self._r.query(":TIM:POS?"))
        srate = float(self._r.query(":ACQ:SRAT?"))
        return TimebaseConfig(scale_s_div=scale, offset_s=offset, sample_rate=srate)

    def get_trigger(self) -> TriggerConfig:
        source = self._r.query(":TRIG:SOUR?").strip()
        level = float(self._r.query(":TRIG:LEV?"))
        slope = self._r.query(":TRIG:SLOP?").strip()
        mode = self._r.query(":TRIG:SWE?").strip()
        return TriggerConfig(source=source, level_v=level, slope=slope, mode=mode)
```
