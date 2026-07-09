# Laboratory Oscilloscope UI

React + Vite frontend for the OpenBIS Oscilloscope Control Service.

## Development

Requires the FastAPI backend running on `http://localhost:8000`. The Vite dev server proxies all `/api/*` requests to it automatically — no CORS configuration needed.

```bash
pnpm install
pnpm dev        # starts on http://localhost:5173
```

Login with your OpenBIS session token. In `DEBUG=True` mode use `debug-token`.

## Production build

```bash
pnpm build      # outputs to dist/
```

The `dist/` folder is served by Nginx in the Docker Compose setup. Nginx also proxies `/api/` to the FastAPI container (see `nginx.conf`).

## Project structure

```
src/
  api/          # Typed API client (client.ts, devices.ts, sessions.ts, auth.ts, types.ts)
  app/
    context/    # AuthContext — token storage and user state
    pages/      # DeviceList, OscilloscopeControl, DataArchive, Login
    components/ # Reusable UI components
  styles/       # Tailwind + theme CSS variables
```
