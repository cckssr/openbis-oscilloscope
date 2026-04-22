# Deployment Guide

This guide covers all supported deployment configurations for openbis-oscilloscope.

## Deployment variants

Two dimensions to choose:

**Backend runtime** — how the FastAPI process and Redis are managed:

| Backend          | When to use                                    |
| ---------------- | ---------------------------------------------- |
| Native (systemd) | Recommended; no Docker required                |
| Docker Compose   | If you prefer containerised process management |

**Hosting** — where the app lives relative to OpenBIS:

| Hosting                  | Example URL                                 | SSL cert             |
| ------------------------ | ------------------------------------------- | -------------------- |
| Dedicated subdomain      | `oscilloscope.physik.tu-berlin.de`          | New cert via certbot |
| Sub-path on OpenBIS host | `openbis.physik.tu-berlin.de/oscilloscope/` | Reuse existing cert  |

The sub-path option requires adding location blocks to your **existing** OpenBIS web server config and building the frontend with a base path flag. No new server block or certificate is needed.

All variants proxy `/api/*` requests to the FastAPI backend on `localhost:8000`.

---

## 1. Prerequisites

### System packages

**nginx (native):**

```bash
apt install nginx certbot python3-certbot-nginx redis-server python3-venv git
```

**Apache2 (native):**

```bash
apt install apache2 libapache2-mod-proxy-httptunnel certbot python3-certbot-apache redis-server python3-venv git
a2enmod proxy proxy_http ssl rewrite headers
```

**Apache2 (Docker):**

```bash
apt install apache2 libapache2-mod-proxy-httptunnel certbot python3-certbot-apache docker.io docker-compose-plugin git
a2enmod proxy proxy_http ssl rewrite headers
```

### Node.js 24 and pnpm

The frontend build requires Node.js ≥ 20. The system `nodejs` package on Ubuntu/Debian is typically v18 and too old — install via nvm instead:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
source ~/.bashrc
nvm install 24
npm install -g pnpm
```

Verify:

```bash
node -v   # v24.x.x
pnpm -v
```

---

## 2. Project setup

```bash
git clone <repo> /opt/openbis-oscilloscope
cd /opt/openbis-oscilloscope
cp .env.example .env
# Edit .env — set OPENBIS_URL, BUFFER_DIR, DEBUG=False, etc.
```

See [Environment file](#6-environment-file) for key settings.

---

## 3. Backend

### Option A — Native (systemd)

```bash
cd /opt/openbis-oscilloscope
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

```bash
systemctl enable --now redis
```

Create `/etc/systemd/system/openbis-oscilloscope.service`:

```ini
[Unit]
Description=openbis-oscilloscope FastAPI
After=network.target redis.service

[Service]
User=www-data
WorkingDirectory=/opt/openbis-oscilloscope
EnvironmentFile=/opt/openbis-oscilloscope/.env
ExecStart=/opt/openbis-oscilloscope/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now openbis-oscilloscope
```

### Option B — Docker Compose

```bash
cd /opt/openbis-oscilloscope
docker compose up -d
```

The backend and Redis are both started by Docker Compose. The backend is exposed on `localhost:8000`; Redis stays internal to the compose network.

---

## 4. Frontend build

Run this as the user who owns `/opt/openbis-oscilloscope` (nvm is per-user).

### Dedicated subdomain

Build from the root path (default):

```bash
cd /opt/openbis-oscilloscope/openbis_webapp
pnpm install --frozen-lockfile
pnpm run build
# Built files land in openbis_webapp/dist/
```

### Sub-path on existing host

Pass `--base` with your chosen path so Vite rewrites all asset references and React Router sets the correct basename automatically:

```bash
cd /opt/openbis-oscilloscope/openbis_webapp
pnpm install --frozen-lockfile
pnpm run build -- --base=/oscilloscope/
# Built files land in openbis_webapp/dist/
```

Replace `/oscilloscope/` with your actual sub-path if different. The trailing slash is required.

---

## 5. Reverse proxy

### Dedicated subdomain

Create a **new** server block / VirtualHost. Replace `oscilloscope.example.org` throughout.

#### nginx

Create `/etc/nginx/sites-available/oscilloscope`:

```nginx
server {
    listen 80;
    server_name oscilloscope.example.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name oscilloscope.example.org;

    ssl_certificate     /etc/letsencrypt/live/oscilloscope.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oscilloscope.example.org/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location /api/ {
        proxy_pass         http://127.0.0.1:8000/;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    root  /opt/openbis-oscilloscope/openbis_webapp/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/oscilloscope /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d oscilloscope.example.org
```

#### Apache2

```apache
<VirtualHost *:80>
    ServerName oscilloscope.example.org
    RewriteEngine On
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
</VirtualHost>

<VirtualHost *:443>
    ServerName oscilloscope.example.org

    SSLEngine On
    SSLCertificateFile    /etc/letsencrypt/live/oscilloscope.example.org/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/oscilloscope.example.org/privkey.pem

    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    ProxyPreserveHost On
    ProxyPass        /api/ http://127.0.0.1:8000/
    ProxyPassReverse /api/ http://127.0.0.1:8000/

    DocumentRoot /opt/openbis-oscilloscope/openbis_webapp/dist

    <Directory /opt/openbis-oscilloscope/openbis_webapp/dist>
        Options -Indexes
        AllowOverride None
        Require all granted
        RewriteEngine On
        RewriteBase /
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule ^ index.html [L]
    </Directory>
</VirtualHost>
```

```bash
a2ensite oscilloscope
systemctl reload apache2
certbot --apache -d oscilloscope.example.org
```

**Required Apache2 modules:** `proxy proxy_http ssl rewrite headers`

---

### Sub-path on existing OpenBIS host

**Do not create a new server block or VirtualHost.** Add the blocks below to your **existing** OpenBIS configuration file and reload. No new SSL certificate is needed — the existing one already covers the domain.

The examples below use `/oscilloscope/` as the sub-path. Adjust to match the `--base` value you passed at build time.

#### nginx — add to existing server block

Open your existing OpenBIS nginx config — typically `/etc/nginx/sites-available/openbis` (symlinked into `sites-enabled`) or directly `/etc/nginx/sites-enabled/openbis.conf`, depending on how it was set up. Either way, edit the file that contains the OpenBIS `server { ... }` block and add inside the block that handles HTTPS:

```nginx
# Oscilloscope API — strip /oscilloscope/api prefix before forwarding
location /oscilloscope/api/ {
    proxy_pass         http://127.0.0.1:8000/;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}

# Oscilloscope SPA static files
location /oscilloscope/ {
    alias /opt/openbis-oscilloscope/openbis_webapp/dist/;
    try_files $uri $uri/ /oscilloscope/index.html;
}
```

```bash
nginx -t && systemctl reload nginx
```

#### Apache2 — add to existing VirtualHost

Open your existing OpenBIS Apache2 config and add inside the `<VirtualHost *:443>` block:

```apache
# Oscilloscope API — strip /oscilloscope/api prefix before forwarding
ProxyPass        /oscilloscope/api/ http://127.0.0.1:8000/
ProxyPassReverse /oscilloscope/api/ http://127.0.0.1:8000/

# Oscilloscope SPA static files
Alias /oscilloscope /opt/openbis-oscilloscope/openbis_webapp/dist

<Directory /opt/openbis-oscilloscope/openbis_webapp/dist>
    Options -Indexes
    AllowOverride None
    Require all granted
    RewriteEngine On
    RewriteBase /oscilloscope/
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ index.html [L]
</Directory>
```

```bash
systemctl reload apache2
```

---

## 6. Environment file

Key production settings in `/opt/openbis-oscilloscope/.env`:

```bash
DEBUG=False
OPENBIS_URL=https://openbis.physik.tu-berlin.de
BUFFER_DIR=/var/lib/openbis-oscilloscope/buffer
REDIS_URL=redis://localhost:6379/0
OPENBIS_SPACE=GP_2025_WISE
```

---

## 7. Firewall

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 8000/tcp   # backend reachable only via the reverse proxy
```

---

## 8. Cookie sharing with OpenBIS

The frontend reads an `openbis` cookie set by the OpenBIS server as a login shortcut. For this to work, both services must share a domain:

| Scenario                                                       | Works?                              |
| -------------------------------------------------------------- | ----------------------------------- |
| oscilloscope.physik.tu-berlin.de + openbis.physik.tu-berlin.de | Yes — `Domain=.physik.tu-berlin.de` |
| Sub-path on the same host as OpenBIS                           | Yes — same domain automatically     |
| oscilloscope.example.org + openbis.other.org                   | No — different domains              |

If the OpenBIS server sets `SameSite=Strict`, the cookie will not be sent cross-origin. Ask your OpenBIS admin to set `SameSite=Lax; Domain=.physik.tu-berlin.de` on the session cookie.

---

## 9. Updating

```bash
cd /opt/openbis-oscilloscope
git pull
```

**Native backend:**

```bash
source .venv/bin/activate
pip install -e .
systemctl restart openbis-oscilloscope
```

**Docker backend:**

```bash
docker compose pull
docker compose up -d
```

**Rebuild frontend** (if `openbis_webapp/` changed) — use the same `--base` flag as the initial build:

```bash
cd /opt/openbis-oscilloscope/openbis_webapp
pnpm install --frozen-lockfile

# Dedicated subdomain:
pnpm run build

# Sub-path deployment:
pnpm run build -- --base=/oscilloscope/
```
