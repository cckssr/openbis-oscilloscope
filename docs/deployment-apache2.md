# Deployment: Apache2 Reverse Proxy

This guide covers deploying the openbis-oscilloscope service behind Apache2 on a Linux server.

## Prerequisites

```bash
apt install apache2 libapache2-mod-proxy-httptunnel certbot python3-certbot-apache
a2enmod proxy proxy_http ssl rewrite headers
```

## Project deployment

### 1. Backend (FastAPI + Redis)

```bash
# Clone and configure
git clone <repo> /opt/openbis-oscilloscope
cd /opt/openbis-oscilloscope
cp .env.example .env
# Edit .env — set OPENBIS_URL, BUFFER_DIR, DEBUG=False, etc.

# Start with Docker Compose
docker compose up -d
```

The backend listens on `localhost:8000` by default. Redis is bundled in the compose file.

### 2. Frontend (Vite build)

```bash
cd openbis_webapp
npm ci
npm run build
# Built files land in openbis_webapp/dist/
```

## Apache2 VirtualHost

Replace `oscilloscope.example.org` with your actual domain throughout.

```apache
<VirtualHost *:80>
    ServerName oscilloscope.example.org
    # Redirect all HTTP to HTTPS
    RewriteEngine On
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
</VirtualHost>

<VirtualHost *:443>
    ServerName oscilloscope.example.org

    # SSL (managed by certbot)
    SSLEngine On
    SSLCertificateFile    /etc/letsencrypt/live/oscilloscope.example.org/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/oscilloscope.example.org/privkey.pem

    # Security headers
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    # --- API reverse proxy ---
    ProxyPreserveHost On
    ProxyPass        /api/ http://127.0.0.1:8000/
    ProxyPassReverse /api/ http://127.0.0.1:8000/

    # --- SPA static files ---
    DocumentRoot /opt/openbis-oscilloscope/openbis_webapp/dist

    <Directory /opt/openbis-oscilloscope/openbis_webapp/dist>
        Options -Indexes
        AllowOverride None
        Require all granted

        # React Router: serve index.html for all non-file paths
        RewriteEngine On
        RewriteBase /
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule ^ index.html [L]
    </Directory>
</VirtualHost>
```

Enable the site and restart:

```bash
a2ensite oscilloscope
systemctl reload apache2
```

### SSL certificate

```bash
certbot --apache -d oscilloscope.example.org
```

Certbot will patch the VirtualHost automatically and set up auto-renewal.

## Cookie sharing with OpenBIS

The frontend reads an `openbis` cookie set by the OpenBIS server as a login shortcut (see `AuthContext.tsx`). For this to work, **both services must share a common parent domain**:

| Scenario | Works? |
|---|---|
| oscilloscope.physik.tu-berlin.de + openbis.physik.tu-berlin.de | Yes — `Domain=.physik.tu-berlin.de` |
| oscilloscope.example.org + openbis.other.org | No — different domains |
| Same host, different paths (e.g., `/oscilloscope` and `/openbis`) | Yes |

If the OpenBIS server sets `SameSite=Strict`, the cookie will not be sent cross-origin. Ask your OpenBIS admin to set `SameSite=Lax; Domain=.physik.tu-berlin.de` on the session cookie.

## Environment file (`.env`)

Key production settings:

```bash
DEBUG=False
OPENBIS_URL=https://openbis.physik.tu-berlin.de
BUFFER_DIR=/var/lib/openbis-oscilloscope/buffer
REDIS_URL=redis://localhost:6379/0
OPENBIS_SPACE=GP_2025_WISE
# Optional: override the fixed debug token (not used in production)
# DEBUG_TOKEN=...
```

## Firewall

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 8000/tcp   # backend reachable only from localhost via Apache
```

## Required Apache2 modules summary

| Module | Purpose |
|---|---|
| `proxy` | Base proxy support |
| `proxy_http` | HTTP reverse proxy |
| `ssl` | HTTPS |
| `rewrite` | SPA fallback + HTTP→HTTPS redirect |
| `headers` | Security response headers |
