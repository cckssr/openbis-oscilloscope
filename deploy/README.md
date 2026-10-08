# `deploy/` — Systemd + Nginx Deployment

Systemd units and nginx config for running the service on a Linux host with journald logging and nightly automatic restart. The install script handles the full setup in one step.

## Files

| File                                   | Purpose                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install.sh`                           | One-shot install script: syncs files, builds frontend, installs systemd units, configures nginx.                                                                                                                                                                                                            |
| `openbis-oscilloscope.service`         | Main uvicorn service. Binds to `127.0.0.1:8000`; nginx is the public face. Logs go to journald via `SyslogIdentifier=openbis-oscilloscope`.                                                                                                                                                                 |
| `openbis-oscilloscope-restart.service` | Oneshot unit that restarts the main service. Called by the timer.                                                                                                                                                                                                                                           |
| `openbis-oscilloscope-restart.timer`   | Fires at 00:05 daily, 10 minutes after the 23:55 nightly sync job writes the updated `oscilloscopes.yaml`.                                                                                                                                                                                                  |
| `nginx.conf`                           | Nginx site config. Serves the Vite SPA at `/oscilloscope/` and proxies `/oscilloscope/api/` to FastAPI. SSE buffering is disabled for `/devices/events` (also carries the acquisition `progress` events); other API requests have a 180 s read timeout for full-memory acquisitions and ZIP/HDF5 downloads. |

## Quick install

Run on the target Linux host as root (requires `python3.11+`, `node 20+` (npm), `nginx`, `redis-server`):

```bash
sudo ./deploy/install.sh
```

Options:

```bash
sudo ./deploy/install.sh --app-dir /opt/openbis-oscilloscope --user lab
```

The script:

1. Creates the system user if it doesn't exist.
2. Rsyncs app files to `--app-dir` (skips `backend/.env`, `backend/buffer/`, `.venv`, `frontend/node_modules`, `frontend/dist`).
3. Creates `backend/.env` from `backend/.env.example` if none exists — **edit it before starting**.
4. Installs the Python package from `backend/` into `backend/.venv`.
5. Builds the Vite frontend (`npm ci && npm run build`).
6. Installs and enables all systemd units.
7. Writes the nginx site config, tests it, and reloads nginx.
8. Starts Redis if not already running.

## Manual installation

```bash
sudo cp deploy/*.service deploy/*.timer /etc/systemd/system/

# Edit WorkingDirectory (`<app-dir>/backend`), User, EnvironmentFile
# (`<app-dir>/backend/.env`), and ExecStart (`<app-dir>/backend/.venv/bin/uvicorn
# app.main:app ...`) in openbis-oscilloscope.service to match your installation path.

sudo systemctl daemon-reload
sudo systemctl enable --now openbis-oscilloscope.service
sudo systemctl enable --now openbis-oscilloscope-restart.timer
```

Nginx:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/openbis-oscilloscope
# Edit the `root` directive to point at your dist/ directory.
sudo ln -s /etc/nginx/sites-available/openbis-oscilloscope \
           /etc/nginx/sites-enabled/openbis-oscilloscope
sudo nginx -t && sudo systemctl reload nginx
```

## URL layout

| Path                               | Handled by                                    |
| ---------------------------------- | --------------------------------------------- |
| `/oscilloscope/`                   | Vite SPA static files (`dist/`)               |
| `/oscilloscope/api/*`              | FastAPI on `127.0.0.1:8000` (prefix stripped) |
| `/oscilloscope/api/devices/events` | FastAPI SSE — nginx buffering disabled        |

## Viewing logs

```bash
# Follow live logs
journalctl -u openbis-oscilloscope -f

# Show logs since last boot
journalctl -u openbis-oscilloscope -b

# Show only sync job output
journalctl -u openbis-oscilloscope -g "OpenBIS sync"
```

## Nightly cycle

| Time  | Event                                                                                       |
| ----- | ------------------------------------------------------------------------------------------- |
| 23:55 | APScheduler fires `eod_openbis_sync` — queries OpenBIS, updates `oscilloscopes.yaml`        |
| 23:59 | APScheduler fires `eod_lock_reset` — clears all Redis device locks                          |
| 00:05 | systemd timer restarts the service — new `oscilloscopes.yaml` loaded by `InstrumentManager` |
