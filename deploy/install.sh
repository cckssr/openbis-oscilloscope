#!/usr/bin/env bash
# Deploy the OpenBIS Oscilloscope service on a Linux host with systemd + nginx.
# Run as root (or with sudo) on the target machine.
#
# Usage:
#   sudo ./deploy/install.sh [--app-dir DIR] [--user USER]
#
# Defaults:
#   --app-dir  /opt/openbis-oscilloscope
#   --user     lab
#
# Prerequisites: python3.11+, pip, pnpm, nginx, redis-server

set -euo pipefail

APP_DIR="/opt/openbis-oscilloscope"
APP_USER="lab"

# Parse flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        --app-dir) APP_DIR="$2"; shift 2 ;;
        --user)    APP_USER="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==> Installing OpenBIS Oscilloscope to $APP_DIR (user: $APP_USER)"

# ── System user ────────────────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
    echo "--> Creating system user $APP_USER"
    useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi

# ── App directory ──────────────────────────────────────────────────────────────
echo "--> Syncing application files to $APP_DIR"
mkdir -p "$APP_DIR"
rsync -a --delete \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.env' \
    --exclude='buffer/' \
    --exclude='frontend/node_modules' \
    --exclude='frontend/dist' \
    "$REPO_ROOT/" "$APP_DIR/"

# ── .env file ──────────────────────────────────────────────────────────────────
if [[ ! -f "$APP_DIR/.env" ]]; then
    if [[ -f "$REPO_ROOT/.env" ]]; then
        echo "--> Copying .env from repo (edit $APP_DIR/.env to configure)"
        cp "$REPO_ROOT/.env" "$APP_DIR/.env"
    else
        echo "--> Creating .env from example (edit $APP_DIR/.env before starting)"
        cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    fi
fi
chmod 640 "$APP_DIR/.env"
chown "root:$APP_USER" "$APP_DIR/.env"

# ── Python virtualenv ──────────────────────────────────────────────────────────
echo "--> Setting up Python virtualenv"
python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$APP_DIR/.venv/bin/pip" install --quiet -e "$APP_DIR"

# ── Frontend build ─────────────────────────────────────────────────────────────
echo "--> Building Vite frontend"
cd "$APP_DIR/frontend"
pnpm install --frozen-lockfile
pnpm build
cd "$REPO_ROOT"

# ── Buffer directory ───────────────────────────────────────────────────────────
mkdir -p "$APP_DIR/buffer"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/buffer"

# ── File ownership ─────────────────────────────────────────────────────────────
chown -R "root:$APP_USER" "$APP_DIR"
chmod -R g+rX "$APP_DIR"
chmod -R u+rw "$APP_DIR"

# ── Systemd units ──────────────────────────────────────────────────────────────
echo "--> Installing systemd units"
# Patch WorkingDirectory and User in the service file to match chosen values
sed \
    -e "s|WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" \
    -e "s|EnvironmentFile=.*|EnvironmentFile=$APP_DIR/.env|" \
    -e "s|ExecStart=.*|ExecStart=$APP_DIR/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000|" \
    -e "s|User=.*|User=$APP_USER|" \
    "$SCRIPT_DIR/openbis-oscilloscope.service" \
    > /etc/systemd/system/openbis-oscilloscope.service

cp "$SCRIPT_DIR/openbis-oscilloscope-restart.service" /etc/systemd/system/
cp "$SCRIPT_DIR/openbis-oscilloscope-restart.timer"   /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now openbis-oscilloscope.service
systemctl enable --now openbis-oscilloscope-restart.timer

# ── Nginx ──────────────────────────────────────────────────────────────────────
echo "--> Configuring nginx"
# Patch the root path in the nginx config to match the chosen app dir
sed "s|root .*frontend/dist;|root $APP_DIR/frontend/dist;|" \
    "$SCRIPT_DIR/nginx.conf" \
    > /etc/nginx/sites-available/openbis-oscilloscope

ln -sf /etc/nginx/sites-available/openbis-oscilloscope \
       /etc/nginx/conf.d/openbis-oscilloscope.conf 2>/dev/null || \
ln -sf /etc/nginx/sites-available/openbis-oscilloscope \
       /etc/nginx/sites-enabled/openbis-oscilloscope

nginx -t
systemctl reload nginx

# ── Redis ──────────────────────────────────────────────────────────────────────
if ! systemctl is-active --quiet redis.service && ! systemctl is-active --quiet redis-server.service; then
    echo "--> Starting Redis"
    systemctl enable --now redis-server.service 2>/dev/null || \
    systemctl enable --now redis.service
fi

echo ""
echo "==> Done. Service status:"
systemctl status openbis-oscilloscope.service --no-pager -l || true
echo ""
echo "    UI:  http://<host>/oscilloscope/"
echo "    API: http://<host>/oscilloscope/api/docs"
echo ""
echo "    Edit $APP_DIR/.env then: systemctl restart openbis-oscilloscope"
echo "    Logs: journalctl -u openbis-oscilloscope -f"
