# `deploy/` — Systemd Unit Files

Systemd units for running the service on a Linux host with journald logging and nightly automatic restart.

## Files

| File                                   | Purpose                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `openbis-oscilloscope.service`         | Main uvicorn service. Reads `.env` from the working directory. All stdout/stderr goes to journald via `SyslogIdentifier=openbis-oscilloscope`. |
| `openbis-oscilloscope-restart.service` | Oneshot unit that restarts the main service. Called by the timer.                                                                              |
| `openbis-oscilloscope-restart.timer`   | Fires at 00:05 daily, 10 minutes after the 23:55 nightly sync job writes the updated `oscilloscopes.yaml`.                                     |

## Installation

```bash
sudo cp deploy/*.service deploy/*.timer /etc/systemd/system/

# Adjust WorkingDirectory and User in openbis-oscilloscope.service before installing.

sudo systemctl daemon-reload
sudo systemctl enable --now openbis-oscilloscope.service
sudo systemctl enable --now openbis-oscilloscope-restart.timer
```

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
