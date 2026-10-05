# `app/scheduler/` — Background Task Scheduling

Configures and runs APScheduler cron jobs that need to fire outside of the request lifecycle.

## Files

### `tasks.py`

**`create_scheduler(lock_service, instrument_manager) -> AsyncIOScheduler`**

Returns a configured `AsyncIOScheduler` with the following registered jobs:

| Job                | Schedule                                        | Action                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eod_openbis_sync` | Daily at 23:55 (timezone: `EOD_RESET_TIMEZONE`) | Calls `sync_oscilloscopes_from_openbis(settings)` to query OpenBIS for EQUIPMENT objects and update `oscilloscopes.yaml`. No-op when `OPENBIS_BOT_USER` is empty. Changes take effect on next restart.  |
| `eod_lock_reset`   | Daily at 23:59 (timezone: `EOD_RESET_TIMEZONE`) | Calls `lock_service.reset_all_locks()` to clear all Redis lock keys, then transitions every `LOCKED` device back to `ONLINE` so devices are not stuck overnight if a client forgot to release its lock. |

The scheduler is started in `app/main.py` after all services are initialised and is shut down before the app exits.

### `openbis_sync.py`

**`async sync_oscilloscopes_from_openbis(settings) -> None`**

Logs into OpenBIS as the bot user, queries EQUIPMENT objects matching `OPENBIS_EQUIPMENT_IP_FILTER` and type `6210`, and updates `oscilloscopes.yaml`:

- Resolves each instrument's driver via `config/driver_mapping.yaml` (keyed by `EQUIPMENT.ALTERNATIV_NAME`).
- Adds new entries (`id = $BARCODE`, `ip = EQUIPMENT.IP_ADDRESS`, `label = EQUIPMENT.COMPANY + " " + EQUIPMENT.ALTERNATIV_NAME`).
- Updates only changed fields for existing entries.
- Writes the YAML atomically (write + rename) and logs every addition and field change at `INFO` level.
- Instruments with no driver mapping entry are skipped (logged at `DEBUG`).

## Configuration

| Setting                       | Purpose                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `EOD_RESET_TIMEZONE`          | IANA timezone string (e.g. `"Europe/Berlin"`) for both cron jobs. Defaults to `"Europe/Berlin"`. |
| `OPENBIS_BOT_USER`            | OpenBIS username for the sync bot. Leave empty to disable the sync job.                          |
| `OPENBIS_BOT_PASSWORD`        | Password for `OPENBIS_BOT_USER`.                                                                 |
| `DRIVER_MAPPING_CONFIG`       | Path to `driver_mapping.yaml`. Defaults to `./config/driver_mapping.yaml`.                       |
| `OPENBIS_EQUIPMENT_IP_FILTER` | IP filter passed to OpenBIS query. Supports trailing `.*` wildcard. Defaults to `141.23.109.*`.  |
