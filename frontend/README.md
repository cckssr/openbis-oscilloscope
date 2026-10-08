# Laboratory Oscilloscope UI

React + Vite frontend for the OpenBIS Oscilloscope Control Service.

## Development

Requires the FastAPI backend running on `http://localhost:8000`. The Vite dev server proxies all `/oscilloscope/api/*` requests to it automatically (the app is served under the `/oscilloscope/` base) — no CORS configuration needed.

```bash
npm ci
npm run dev   # starts on http://localhost:5173
```

Login with your OpenBIS session token. In `DEBUG=True` mode use `debug-token`.

## Production build

```bash
npm run build   # outputs to dist/
```

The `dist/` folder is served by nginx, which also proxies `/oscilloscope/api/` to FastAPI (see `deploy/nginx.conf`).

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

## Components (shared)

All strings live in `src/i18n/de/*.ts` (German); styling uses the `--lab-*` tokens from `src/styles/theme.css`
(`coarse:` variant = touch pointer, `help-text` = 12 px secondary text, `tap-target` = 32/44 px minimum size).

| Component (`src/app/components/`) | Purpose |
| --- | --- |
| `NumericInput` | Number field with string draft, parse/validate on blur/Enter (`-`, `,`/`.`, SI suffix `200m`/`5µ`, unit text), Escape reverts, ArrowUp/Down and large ± buttons, linear `step` or sequence `steps` (1-2-5), inline errors ("max. 10 V"). Props: `value`, `onCommit(v)`, `unit`, `min`, `max`, `step`, `steps`, `format`, `showUnit`, `disabled`, `id`, `aria-label`, `className` (`onChange` = deprecated alias of `onCommit`). Parsing helpers: `common/numericParsing.ts`. |
| `SegmentedControl` | Single choice. `options: (string \| {value,label,help?})[]`; wraps; becomes a `Select` for > 3 options or `asSelect`; radiogroup semantics with arrow keys; shows the selected option's `help` as visible text. |
| `StatusBadge` | Device state chip with icon + German label; `isMine` turns LOCKED into "Du steuerst". |
| `DeviceCard` | One device: status, address, `last_error` + "Bitte Betreuer:in informieren" for ERROR, button "Öffnen" / "Fortsetzen" (own lock) / disabled "Belegt" (owner + since) / "Offline" / "Nicht verfügbar". |
| `ErrorBoundary` | Root boundary ("Etwas ist schiefgelaufen" + "Seite neu laden"). |
| `common/RegionBoundary` | Per-region boundary (`name`, `resetKeys`, `fallback`); "Erneut versuchen" resets it; logs the error. |
| `common/HelpPopover` | "?" button with a popover that works on tap (replaces `title`/ⓘ help). |
| `common/DisabledReason` | Wraps a disabled control: tooltip on desktop, visible line under it on touch. |
| `common/PageHeader` | Page top bar: back button (`backTo` or `onBack`), `title`, `subtitle`, `status` and `actions` slots; wraps on narrow screens. |
| `common/EmptyState` | Centered empty block with icon, text and action. |

## Pages: login & device list

- `pages/Login.tsx` — "Mit openBIS anmelden" (only when `GET /config` reports `openbis_url`) opens openBIS in a new tab;
  "Anmeldung prüfen" (also tried automatically when the window regains focus) re-reads the `openbis` cookie via
  `useAuth().loginFromOpenBISCookie()`. The token field sits under "Erweitert: Sitzungstoken eingeben" (open by default
  when there is no SSO). The `debug-token` hint appears only when `config.debug`.
- `context/AuthContext.tsx` + `context/openbisSession.ts` — token from localStorage, `openbis` cookie or `#token=`
  fragment (resolved once at startup), validated against `/auth/me`.
- `pages/DeviceList.tsx` — card grid (auto-fill, tablet friendly), header link "Meine Messdaten" (`/sessions`).
  `pages/devices/useDevices.ts` loads the list, follows the SSE stream (`device_state` applied in place, `lock`
  events refetch) and polls every 5 s only while SSE is disconnected; `pages/devices/lockSince.ts` formats `acquired_at`.
