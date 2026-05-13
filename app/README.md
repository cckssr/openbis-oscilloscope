# `app/` — Application Package

This is the root of the FastAPI application. `main.py` is the entry point; all other code lives in subpackages.

## Files

| File        | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.py`   | App factory (`create_app()`) and lifespan manager (`lifespan()`). Wires together all services at startup and tears them down on shutdown.                                                                                                                                                                                                                                                                                                                                       |
| `config.py` | Pydantic `Settings` class. All environment variables are read here and nowhere else. Key settings: `REDIS_URL`, `OPENBIS_URL`, `OPENBIS_SPACE`, `OPENBIS_DATASET_TYPE`, `BUFFER_DIR`, `OSCILLOSCOPES_CONFIG`, `LOCK_TTL_SECONDS`, `HEALTH_CHECK_INTERVAL_SECONDS`, `HEALTH_CHECK_TCP_TIMEOUT_SECONDS`, `TOKEN_CACHE_SECONDS`, `EOD_RESET_TIMEZONE`, `DEBUG`, `DEBUG_TOKEN`, `OPENBIS_BOT_USER`, `OPENBIS_BOT_PASSWORD`, `DRIVER_MAPPING_CONFIG`, `OPENBIS_EQUIPMENT_IP_FILTER`. |

## Startup / shutdown order

```
Startup
  1. Redis (real) or FakeRedis (DEBUG=True)
  2. LockService, InstrumentManager, BufferService, OpenBISClient
  3. Load config/oscilloscopes.yaml → per-device asyncio worker tasks
  4. Pre-connect mock devices (driver: "mock") so they are immediately ONLINE
  5. HealthMonitor — always started; skips mock devices internally
  6. APScheduler (OpenBIS oscilloscope sync at 23:55; end-of-day lock reset at 23:59)
  7. Attach everything to app.state for dependency injection

Shutdown (reverse)
  Scheduler → HealthMonitor → InstrumentManager → Redis
```

## Subpackages

| Package                                       | Responsibility                                        |
| --------------------------------------------- | ----------------------------------------------------- |
| [`api/`](api/README.md)                       | HTTP route handlers                                   |
| [`core/`](core/README.md)                     | DI helpers, exception hierarchy                       |
| [`instruments/`](instruments/README.md)       | Device lifecycle, drivers, health monitor             |
| [`locks/`](locks/README.md)                   | Redis-backed exclusive device locks                   |
| [`buffer/`](buffer/README.md)                 | On-disk artifact storage                              |
| [`openbis_client/`](openbis_client/README.md) | pybis wrapper for token validation and dataset commit |
| [`scheduler/`](scheduler/README.md)           | APScheduler cron jobs                                 |

## Request flow

```
Client (Bearer token)
  → FastAPI
  → get_current_user()  — validates token against OpenBIS (TTL-cached)
  → make_lock_dependency()  — checks Redis lock ownership
  → InstrumentManager.execute_command()
  → per-device asyncio.Queue worker
  → driver method (SCPI over TCP)
  → BufferService  — writes CSV / PNG / HDF5 to disk
```
