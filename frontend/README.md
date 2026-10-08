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

## Device session store

`src/app/state/` holds one **session store per device** above the router (`DeviceSessionProvider`, wrapped around the router in `App.tsx`). Lock, live view, settings, the last capture and jobs therefore survive navigation (e.g. control page -> archive -> back). The store owns all side effects (heartbeat, live loop, SSE progress, tab coordination); components only render state and call actions. The contract is `deviceSession/types.ts` (`DeviceSessionState`, `DeviceSessionActions`, `Workflow`).

```text
state/
  DeviceSessionProvider.tsx   # token from useAuth(); lazy Map<deviceId, store>; disposes all stores on logout / token change (locks are NOT released)
  deviceSession/
    index.ts                  # public API - components import only from here
    types.ts                  # the contract
    hooks.ts                  # useDeviceSession, useDeviceSessionSelector, useSetting
    workflow.ts               # selectWorkflow(state) - stepper + "Als Nächstes" hint (pure)
    store.ts                  # DeviceSessionStore: state, subscribe, wiring of the modules below
    registry.ts               # DeviceSessionRegistry: deviceId -> store for one token
    lockController.ts         # take / reclaim / release, heartbeat, soft release on unload, tab hand-over
    heartbeat.ts  tabCoordinator.ts   # lock keep-alive; BroadcastChannel("osc-device-<id>") protocol
    liveController.ts  liveLoop.ts    # live preview + run/stop/single/force-trigger/autoscale; sequential preview loop
    captureController.ts      # capture, full resolution (SSE progress, cancel), screenshot, series, notes, counts
    settingsApplier.ts  settingsPaths.ts   # debounced "apply immediately" settings, path helpers
    commandQueue.ts  jobs.ts  # one promise queue per device (`busy`); job list (kept ~5 s, last 10)
    captureCounts.ts  frames.ts  selectorCache.ts  context.ts  initialState.ts
    testing.ts                # fake scope + fake BroadcastChannel for tests
```

**Hooks** (all take the device id):

```ts
useDeviceSession(deviceId): DeviceSession            // { state, actions }, re-renders on every change
useDeviceSessionSelector<T>(deviceId, selector: (s: DeviceSessionState) => T,
                            isEqual = Object.is): T  // re-renders only when the slice changes
useSetting(deviceId, path: SettingPath): { value, applied, status, set(value) }  // value = pending ?? applied
selectWorkflow(state: DeviceSessionState): Workflow  // pure
```

The first hook call for a device starts its store: it loads the device, reads the settings once without a lock (so `settings.applied` is available read-only before the device is taken; silent if the device is offline) and **reclaims** a lock that is already ours, e.g. after F5. A reclaim also restores `lastCapture` and the plot (`frame`, source `"capture"`) from the newest acquisition in the archive (`getArtifactWaveform`; channel configs and timebase come from the current settings, the sample rate from the time axis; if the waveforms cannot be loaded `lastCapture` keeps note and flag with an empty frame). Use `useDeviceSessionSelector` in components that must not re-render per live frame (the note field), and call `actions.pauseLive()` / `actions.resumeLive()` when the control page unmounts / mounts.

**Behaviour in short**

- **Lock:** `takeControl` acquires (or reclaims) the lock, then loads settings, memory depth and capture counts. Heartbeat every `min(60 s, lock_ttl_seconds / 5)`, only in the controlling tab. A failed heartbeat sets `lock.status = "lost"` (German message), stops live and series and keeps the last frame. `release` keeps `frame` / `lastCapture` visible and remembers `previousSessionId`. On `pagehide` / `beforeunload` the controlling tab calls `softReleaseLockOnUnload` (never a hard unlock).
- **Second tab:** a tab that finds the lock already ours asks the other tabs (300 ms) and becomes `passive` (no heartbeat, no loops, read-only UI) if one answers; `takeControl()` there takes over and turns the other tab passive. Without `BroadcastChannel` every tab acts alone.
- **Live:** `startLive` = RUN + a sequential `previewWaveforms` loop (min period 500 ms, nothing is stored); requests only channels enabled in the *applied* settings; three consecutive failures stop live with a toast.
- **Commands:** apply settings, capture, run/stop, single, force trigger, autoscale and screenshot go through one queue per device; `state.busy` is the German label of the running command (reason for disabled buttons). The live loop yields to queued commands.
- **Settings:** applied immediately (debounce 400 ms per channel / timebase / trigger group); `pending` -> `applying` -> `applied`, on failure the control reverts and a toast shows. Captures and overlays always use `settings.applied`.
- **Captures:** `saveCapture` stops live, reads the applied enabled channels and shows the result as `frame` (source `"capture"`) and `lastCapture`. The note belongs to `lastCapture` only. Full resolution is a cancellable job with SSE progress; a backend `acquisition_cancelled` ends it as `cancelled` without a toast. `counts` come from `listArtifacts` (traces grouped per acquisition, screenshots individually, `uploaded` missing = false).

Tests: `deviceSession/*.test.ts` and `state/hooks.test.tsx` mock `src/api/*` (`vi.mock`) and use fake timers (`npm test`).

## Plot, analysis & export

Files: `src/app/components/plot/**`, `src/lib/decimate.ts`, `src/lib/analysis/**`, `src/lib/export/**`, `src/lib/download.ts`, strings in `src/i18n/de/plot.ts`.

**`<WaveformPlot>`** (`components/plot/WaveformPlot.tsx`, props in `plot/types.ts`) draws `Trace[]` (see `lib/trace.ts`) with Plotly (partial `plotly-gl2d` bundle, `plot/plotlyBundle.ts`; Plotly's own modebar is off).

- *Y modes:* `"divisions"` (default when every trace has `scale`) draws each channel at `(v + offset) / perDiv` on a ±4 div screen, hover shows the real voltage; `"volts"` shares one axis "Spannung (V)". Axis titles are "Zeit", "Divisionen" / "Spannung (V)" with SI tick labels (d3 format `.6~s`).
- *X range:* with `timebase` the scope screen (10 div centred on `offsetS`; a record starting later, e.g. the mock at t = 0, starts the screen at the record start), else the data extent.
- *Interaction:* own toolbar (Zoom / Verschieben, Achsen anpassen, Ansicht zurücksetzen, Cursor, then `toolbarExtras`). Drag mode defaults to zoom on fine pointers and pan on coarse pointers; `scrollZoom` only on fine pointers; double-click resets; `showTips: false` (no Plotly notifier on other pages). Zoom/pan persists across live frames (`uirevision` = `viewKey`; layout ranges are copied because Plotly writes into them); a new `viewKey` remounts the plot with a fresh view.
- *Performance:* `lib/decimate.ts` min/max peak-detect decimation per visible window (≤ 2 × plot width points per trace, re-done from the relayout range when zooming, memoised per sample array); `scattergl` above 100 000 samples per trace.
- *Overlays:* trigger level (colour + scale of its trace), trigger time, `cursor-x`/`cursor-y`, markers, plus per-channel ground markers ("1▶") in divisions mode. Plotly shapes are non-editable.
- *Cursors:* `CursorOverlay.tsx` is an HTML layer (two 36/44 px wide drag handles) mapped with the fixed `MARGIN` constants, not Plotly editable shapes, so trigger shapes stay fixed and touch drag works. `CursorReadout.tsx` shows t1, t2, Δt, 1/Δt and each trace's values/ΔU.
- *Readouts:* `ReadoutBar.tsx` (under the plot, wraps): "CH1 200 mV/div · DC · 10×", Zeitbasis (`formatPerDiv`), Abtastrate, Speichertiefe.
- Props additions: `onPlotElement(el)` returns the Plotly graph div for `ExportMenu` (`plotElement`).

Other components: `MeasurementTable` (`{ traces, level, className }`; rows = channels, columns = chosen measurements, popover "Messwerte wählen" persisted in localStorage `lab.measurements.v1`, phase column in expert level with reference-channel select), `ExportMenu` (`{ input: ExportInput, className }`), `SpectrumPlot` (`{ traces, maxFrequency?, viewKey?, … }`, FFT in dBV over Hz).

**Analysis registry** (`lib/analysis/`): `Analysis { id, label, unit, level, inputs.traces 1|2, output?, compute(traces) }`, `registerAnalysis` / `getAnalysis` / `listAnalyses(level?)` ("expert" = all). Built-ins (`builtins.ts`): `vpp`, `vmax`, `vmin`, `mean`, `rms` (mean/RMS over whole periods when a period is found), `frequency`, `period` (Schmitt-trigger crossings at the 50 % level, rejects aperiodic input), `rise-time` (10–90 %, 2nd/98th percentile levels), `phase` (inputs 2: reference, other; **positive = second trace lags**, circular mean over rising edges, degrees in (−180, 180]) and `fft` (`output: "traces"`, Hann window, dBV re 1 V rms). `computeMeasurements(traces, ids, referenceTraceId?)` is the pure core; `useMeasurements(traces, selectedIds, { referenceTraceId?, debounceMs? })` runs it in `analysis.worker.ts` (debounced, stale results dropped, uniform time axes sent as `x0/dt`; main-thread fallback without `Worker`) and returns `{ measurements, computing, get(traceId, id) }`. `formatMeasurement(m)` formats with SI prefixes ("—" for NaN).

**Export registry** (`lib/export/`): `Exporter { id, label, ext, appliesTo, isAvailable?(input), run(input) → Blob | { serverUrl } }`, `ExportInput { traces?, plotElement?, token?, sessionId?, artifactIds?, baseName }`, `listExporters(input?)`, `runExporter(exporter, input)` (saves via `lib/download.ts`). Built-ins: `csv` (`time_s,CH1_V,…`, full resolution, decimal point), `npz` (`time_s.npy` + one `.npy` v1.0 per trace, zipped uncompressed like `numpy.savez`), `png` (`Plotly.toImage`, accepts the graph div or any wrapper), `hdf5` and `zip` (server, need token + sessionId + artifactIds).

Tests: `lib/decimate.test.ts`, `lib/analysis/*.test.ts` (synthetic sine/square/triangle/trapezoid signals), `lib/export/export.test.ts`, `components/plot/MeasurementTable.test.tsx`. The plot itself is checked visually (Plotly does not run in jsdom).


## Settings registry & inspector

Files: `src/app/controls/**` (registry + generic renderers), `src/app/pages/control/settings/**` (inspector UI), strings in `src/i18n/de/settings.ts`.

Settings are **data**: a `ControlGroupDef` (`controls/types.ts`) lists `ControlDef`s of kind `number` (`unit`, `min`/`max`/`step` as values or functions of the context, `scale: "linear" | "125" | number[]`), `enum` (`options` as list or function of the context) or `toggle`. Every control has a `level` (`basic` = Einfach, `expert` = Erweitert shows everything), optional `help`, `visible(ctx)` and `requires` (capability). The context is `{ settings, channel?, channelCount }`; `settings` is the applied snapshot with pending edits overlaid, so e.g. the offset step (V/div / 10), the trigger-level step (V/div of the trigger source) and the trigger-source options (CH1..CHn) follow the user's last choice.

- **Registry** (`controls/registry.ts`, re-exported from `controls/index.ts`): `registerControlGroup(def)` (replaces a group with the same id, returns an unregister function), `getControlGroups({ level, capabilities, channelCount })` → groups filtered by level, `requires`, channel count; each returned group only contains the controls visible at that level. Importing `controls/index.ts` registers the built-in groups defined in `controls/groups/{channels,timebase,trigger}.ts` (channels: toggle `basic`, everything else `expert`; timebase and trigger groups are `expert`). Paths: `controlPath(group, def, channel)` → `channels.<n>.<key>`, or `<pathPrefix ?? id>.<key>`. A group may set `component` to replace the generic body, `summary(ctx)` for collapsed headers and `enableKey` for the per-channel on/off toggle.
- **Renderers** (`controls/renderers/`): `NumberControl`, `EnumControl`, `ToggleControl` (props `{ deviceId, def, path, ctx, disabled, disabledReason }`), `ControlRenderer` (dispatch by `kind`), `ControlStatus` (spinner while pending/applying, "✓ übernommen" fading after ~2 s, "⚠ message" on error), `ControlShell` (label + "?" popover + status). They use `useSetting` through the one seam `controls/store.ts` (also `useInspectorModel`), so tests mock a single module. Validation, units and stepping live in `NumericInput` / `SegmentedControl`.
- **Inspector** `<SettingsInspector deviceId level canEdit readOnlyReason? onTakeControl? layout? className? />`: groups as Radix tabs (list scrolls above 4 groups; icons show from 352 px container width, container query) or `layout="accordion"` (headers show `summary`); a single group renders without tabs. Each group sits in a `RegionBoundary`. Per-channel groups use collapsible sections with colour chip, one-line summary (`CH1 · 200 mV/div · DC · 1×` / `CH2 · aus`) and the on/off switch in the header; enabled channels start expanded. In `basic` level only the compact on/off rows remain. With `canEdit=false` all controls are disabled (`title` = reason), the content is dimmed and a sticky banner "Gerät übernehmen, um Einstellungen zu ändern" (or `readOnlyReason`) offers the `onTakeControl` button. Works from 280 px container width; scrolling is up to the parent.

Tests: `controls/registry.test.ts`, `controls/renderers/renderers.test.tsx`, `pages/control/settings/SettingsInspector.test.tsx` (fixtures in `controls/testing.ts`).
