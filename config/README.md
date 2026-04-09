# `config/` — Device Inventory

## Files

### `oscilloscopes.yaml`

The single source of truth for which oscilloscopes the service controls. Loaded by `InstrumentManager.startup()` at application start.

**Schema:**

```yaml
oscilloscopes:
  - id: "scope-01" # unique device identifier used in all API paths
    ip: "192.168.1.100" # LAN IP address
    port: 5025 # TCP port (5025 = standard LXI/SCPI port)
    label: "Rigol DS1054Z" # human-readable name shown in the API
    driver: "drivers.RigolDS1000.RigolDS1000" # Python dotted import path
```

**Special driver values:**

| Value                               | Behaviour                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `"mock"`                            | Uses `MockOscilloscopeDriver` for this device regardless of `DEBUG` mode    |
| `"drivers.RigolDS1000.RigolDS1000"` | Rigol DS1000Z series via PyMeasure                                          |
| Any dotted path                     | Dynamically imported by `InstrumentManager.instantiate_driver()` at startup |

## Adding a new device

1. Add an entry to `oscilloscopes.yaml`.
2. If the driver class does not exist yet, copy `drivers/my_oscilloscope.py`, implement the abstract methods, and point `driver:` to it.
3. Restart the service — `InstrumentManager` picks up the new entry on startup.

## Removing a device

Delete the entry from `oscilloscopes.yaml` and restart. Any existing buffer artifacts for that `device_id` remain on disk.
