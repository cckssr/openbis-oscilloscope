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

## End-to-end tests (Playwright)

```bash
npm install                   # installs @playwright/test
npx playwright install        # downloads browser binaries
npx playwright test           # runs all specs in e2e/
npx playwright test --reporter=html   # with HTML report
```

Set environment variables before running:

| Variable               | Default                          | Description                                    |
| ---------------------- | -------------------------------- | ---------------------------------------------- |
| `OPENBIS_TEST_TOKEN`   | —                                | Valid OpenBIS session token (required)         |
| `OPENBIS_TEST_SPACE`   | —                                | Writable experiment path for commit tests      |
| `OPENBIS_URL`          | —                                | OpenBIS server URL                             |
| `BACKEND_URL`          | `http://127.0.0.1:8000`          | FastAPI backend URL                            |
| `FRONTEND_URL`         | `http://localhost:5173`          | Vite dev server URL                            |
| `OSCILLOSCOPES_CONFIG` | `config/oscilloscopes.test.yaml` | Device inventory for the backend               |
| `SKIP_WEBSERVER`       | —                                | Set to `1` to manage backend/frontend yourself |

Playwright starts both the FastAPI backend and Vite dev server automatically unless `SKIP_WEBSERVER=1`. All specs live in `e2e/`. See `docs/HARDWARE_TESTING.md` for the full test workflow.

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
