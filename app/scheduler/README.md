# `app/scheduler/` — Background Task Scheduling

Configures and runs APScheduler cron jobs that need to fire outside of the request lifecycle.

## Files

### `tasks.py`

**`create_scheduler(lock_service, instrument_manager) -> AsyncIOScheduler`**

Returns a configured `AsyncIOScheduler` with the following registered jobs:

| Job              | Schedule                                        | Action                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eod_lock_reset` | Daily at 23:59 (timezone: `EOD_RESET_TIMEZONE`) | Calls `lock_service.reset_all_locks()` to clear all Redis lock keys, then transitions every `LOCKED` device back to `ONLINE` so devices are not stuck overnight if a client forgot to release its lock. |

The scheduler is started in `app/main.py` after all services are initialised and is shut down before the app exits.

## Configuration

`EOD_RESET_TIMEZONE` — IANA timezone string (e.g. `"Europe/Zurich"`), set in `.env`. Defaults to `"UTC"`.
