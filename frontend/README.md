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
  api/          # Typed, validated API client (see "API client & validation")
  app/
    context/    # AuthContext — token storage and user state
    pages/      # DeviceList, OscilloscopeControl (entry for control/), DataArchive (+ archive/), MySessions (+ sessions/), Login
    components/ # Reusable UI components (upload/ = upload wizard)
  styles/       # Tailwind + theme CSS variables
```

## API client & validation

`src/api/` is the only place that talks to the backend. Every JSON response is validated with
[zod](https://zod.dev) at this edge (UX review §5.2), so components only ever see data that matches
the interfaces in `types.ts`.

| File | Role |
| --- | --- |
| `client.ts` | `apiFetch` (Bearer token, JSON or Blob) and `ApiError(status, code, message)`. |
| `types.ts` | Hand-written response interfaces used by the whole app. |
| `schemas.ts` | One zod schema per response; `parseDeviceEvent` for SSE; a compile-time `SchemaChecks` tuple that fails `tsc` when a schema output stops being assignable to its `types.ts` interface. |
| `validate.ts` | `parseOrThrow`, `parseList`, `filterValid`, plus the schema helpers `lenientArray` and `sampleArray`. |
| `devices.ts`, `sessions.ts`, `auth.ts`, `config.ts`, `events.ts`, `openbis_structure.ts` | Endpoint wrappers; each one pipes the body through its schema. Blob endpoints (screenshot PNG, ZIP, HDF5) and `void` endpoints are not validated. |

Rules:

- **Unknown fields are ignored** (objects are non-strict and strip extras), so a newer backend never breaks the UI.
- **Unknown capabilities are dropped**: `DeviceDetail.capabilities` keeps only names listed in `KNOWN_CAPABILITIES`.
  Add a name there (and to the `Capability` union) when the UI learns to render a new control.
- **Malformed list elements are skipped** with `console.warn("[api] Skipped invalid …[i]: …")`; the rest is returned.
  This applies to `listDevices`, `listArtifacts`, `listMySessions`, the openBIS structure lists and to nested lists
  (`lab_courses`, `channels` and `waveforms` of preview/acquire). In `DeviceSettings.channels` a bad entry or non-numeric key is dropped the same way.
- **Malformed top-level responses throw** `ApiError(502, "invalid_response", "Unerwartete Antwort vom Server")`
  (details go to `console.warn`, never the offending payload). Callers show it with `notifyError` like any other `ApiError`.
- **Legacy data gets defaults**: artifacts without `uploaded` / `uploaded_at` / `perm_id` / `annotation` / `run_id`,
  `AppConfig` fields an older backend does not send, `capabilities` (`[]`) and `channel_count` (`4`).
- **SSE events**: `subscribeDeviceEvents` hands only valid `device_state` / `lock` / `progress` events to the callback;
  unknown event types are silently ignored, malformed known events are ignored with a warning.
- **Performance**: waveform `time_s` / `voltage_V` arrays can hold millions of samples, so they are *not* validated per element:
  `sampleArray` checks `Array.isArray`, the first and last element, and both arrays must have equal length. The array is
  returned by reference (no copy).

Adding an endpoint: add the interface to `types.ts`, the schema (and a `SchemaChecks` entry) to `schemas.ts`,
and call `apiFetch<unknown>(…).then((raw) => parseOrThrow(Schema, raw, "GET /path"))` (or `parseList` for lists).
Tests: `api/schemas.test.ts`. Other suites mock whole `src/api/*` modules, so they are unaffected.

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

- *Y modes:* `"divisions"` (default when every trace has `scale`) draws each channel at `(v + offset) / perDiv` on a ±4 div screen, hover shows the real voltage; `"volts"` shares one axis "Spannung (V)". Axis titles are "Zeit", "Divisionen" / "Spannung (V)" with one SI prefix per x axis (`plot/axisScale.ts`: the prefix is chosen from the frame range and x data is divided by it, so ticks and hover read "0 ms", "1 ms", "2,5 ms" or "−5 µs"; a different prefix changes `uirevision` and resets the view).
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

## Control page (shell, layout, header, workflow, banners, plot)

Files: `src/app/pages/OscilloscopeControl.tsx` (thin route entry, exports `OscilloscopeControl`, reads `:deviceId`) → `pages/control/ControlPage.tsx` (composes the slots; no logic of its own), strings in `i18n/de/control.ts` → `page`. State lives only in the device session store; components subscribe through selectors (`pages/control/actions/session.ts` is the shared seam for `useDeviceActions` / `useDeviceSessionSelector`).

**Slots** (`control/layout/slots.ts`, type `ControlSlots`): `header`, `stepper`, `banners`, `plot`, `readouts` (measurements), `statusbar`, `actions(layout, extras?)`, `inspector({ layout, initialGroupId? })`, `lastCapture(layout)`. Features fill slots and never know where they end up: `ControlLayout` (`layout/ControlLayout.tsx`) puts them into a CSS grid with named areas (`header / stepper / banners / main / statusbar`, `h-dvh`, no page scroll) and lets a per-breakpoint layout arrange `main`. **To add a feature:** build the component, then add it to the matching slot in `ControlPage.tsx` (e.g. a new analysis button next to `<PlotRegion>`'s toolbar extras, a new action group inside the `actions` slot, a new banner in `banners/ControlBanners.tsx`); slots that depend on the layout receive it as an argument (`ActionLayout` = `column | rail | bar`, inspector `tabs | accordion`).

| Breakpoint (`useBreakpoint()`, matchMedia on width) | Layout | Arrangement |
| --- | --- | --- |
| `desktop` ≥ 1280 px | `DesktopLayout` | `ResizablePanelGroup`: actions column (260 px, 220–360, collapsible) · plot + measurements · inspector (340 px, min 300, max 560, collapsible); collapsed panels shrink to a 44 px strip (`SidePanel`) |
| `landscape` 1024–1279 px | `LandscapeLayout` | 72 px action rail (`layout="rail"`, Notiz button right after the capture button, opens a left `Sheet`) · plot (~880 px) · slim `InspectorRail` (one icon per settings group) that opens the settings in a right `Sheet` with that group preselected (`SettingsInspector initialGroupId`) |
| `portrait` < 1024 px (768+) | `PortraitLayout` | plot full width (55 % of the height, at least 27 rem; the content scrolls beyond that) with measurements below · bottom action bar (`layout="bar"`: Aufnahme speichern, Notiz, Einstellungen, Live …) · settings in a bottom `Sheet` with `layout="accordion"`, last capture in a bottom `Sheet` (`compact`) |

**Header** (`header/`): back, device label + id, `StatusBadge`, status line ("Du steuerst dieses Gerät · aktiv seit 14:02", `statusLine.ts`), `LevelToggle` (Einfach/Erweitert, `useControlLevel` → localStorage `controlLevel`, migrates the old `expertMode` key), `ArchiveLink` ("Messdaten (n)" → `/archive/<sessionId | previousSessionId>`, else `/sessions`), `OwnerButton` ("Gerät übernehmen" primary / "Gerät freigeben" secondary, reasons via `DisabledReason`). `ReleaseGuardDialog`: with `counts.notUploaded > 0` releasing asks "n Aufnahmen sind noch nicht hochgeladen." → Jetzt hochladen (archive) / Trotzdem freigeben / Abbrechen; the plot stays after release.

**Workflow** (`workflow/`): `WorkflowStepper` renders `selectWorkflow(state)` as ① … ⑤ chips (icon + label + screen-reader state, `aria-current` on the active one; compact on tablets: only the active label), step ⑤ links to the archive, plus the "Als Nächstes" hint (also the empty-plot message).

**Banners** (`banners/`, stacked in the `banners` slot): `LockLostBanner` (alert, "Erneut übernehmen"), `PassiveTabBanner` ("Hier übernehmen"), `DeviceStateBanner` (OFFLINE/ERROR + `last_error`), `EodBanner` (`eodMinutesLeft(now, eod_reset_time, eod_timezone)` → warning from 10 min before the daily reset, only while controlling or with un-uploaded captures). A failed device load (`deviceError`) replaces the page with an `EmptyState` ("Erneut versuchen").

**Plot region** (`plot/`): `PlotRegion` → `WaveformPlot` with `frame.traces`, `frame.timebase`, `viewKey=deviceId` (zoom survives live frames), `memoryDepth`, toolbar extras `LiveStatusBadge` + `ExportMenu` (server-side exports get token/session/artifact ids only while the frame is the last capture), `SavingOverlay` ("Wird gespeichert…") while a capture/full-resolution/screenshot job runs. `overlays.ts` builds the trigger overlays from **applied** settings (live frames) or the capture's own trigger, never from pending edits. `MeasurementsPanel` wraps `MeasurementTable` (collapsed by default on screens < 820 px high). Plot, actions and inspector each sit in a `RegionBoundary`.

**Lifecycle** (`useControlLifecycle`): `resumeLive()` + `refreshCounts()` on mount, `pauseLive()` on unmount (live pauses when leaving the page, the lock keeps running), document title "<Gerät> – Oszilloskop"; `useControlShortcuts` is mounted in `ControlPage`. Settings are read-only unless `lock.status === "held"` (reason + "Gerät übernehmen" in the inspector banner).

Tests: `layout/ControlLayout.test.tsx` (slot placement per breakpoint), `layout/useBreakpoint.test.tsx`, `header/OwnerButton.test.tsx` (release guard), `banners/eodWarning.test.ts`, `banners/LockBanners.test.tsx`, `workflow/WorkflowStepper.test.tsx`.

## Control page: actions & capture components

Files: `src/app/pages/control/{actions,capture,status}/**`, strings in `src/i18n/de/control.ts` (`de.control.actions`). The page shell places them; every component takes `deviceId`. `layout` (`"column"` desktop side column, `"rail"` 72 px tablet icon rail with stacked icon + short label, `"bar"` large horizontal buttons for the portrait bottom bar) lets one component serve all three placements. All buttons are >= 40 px on touch (`coarse:`); the capture button is the only primary button.

All components read the store through the one seam `actions/session.ts` (`useDeviceSessionSelector`, `useDeviceActions`, `useActionModel`), so they only re-render on their own slice (the note field never re-renders per live frame) and tests mock a single module (`actions/testing.ts` has a reactive `FakeSession`). `actions/availability.ts` is the pure rule set "visible (capability) / disabled reason" shared by buttons and shortcuts; a disabled control shows its reason as tooltip and, on touch, as visible text (`DisabledReason`; in rail/bar one shared line under the group).

- **`<LiveControls deviceId level layout />`** (`actions/`): one Live toggle (▶ Live starten / ■ Live stoppen, never both; spinner while `starting`), "Scope anhalten", "Auto-Setup" (basic and expert, with "?" help) and, in expert level, "Einzeltrigger", "Trigger erzwingen", "Serienaufnahme starten/stoppen" (with count). Controls without the device capability are hidden; an empty capability list (driver not connected) keeps them visible but disabled. Reasons: "Zuerst Gerät übernehmen", the store's `busy` label, "Volle Auflösung wird gelesen…", "Serienaufnahme läuft – zuerst stoppen".
- **`useControlShortcuts(deviceId, { onOpenFullResolution? })`** and **`SHORTCUTS`** / `withShortcut(text, id)` / `NOTE_INPUT_ID`: Space = Live on/off, S = save capture, N = focus `#capture-note-input`, F = full resolution (only with the callback). Ignored while typing (input/textarea/select/contenteditable), while a dialog or menu is open, with modifier keys, when Space is meant for a focused button, unless the lock is held, and whenever the matching button would be disabled.
- **`<CaptureButton deviceId layout />`** (`capture/`): split button "Aufnahme speichern" (spinner + "Wird gespeichert…") with a ▾ menu "Volle Auflösung (langsam)…" (opens `FullResolutionDialog`, owned by the button) and "Bildschirmfoto des Oszilloskops" (saves once; `screenshotToast.tsx` shows a toast with a thumbnail from the archive and a "Herunterladen" action, nothing downloads automatically; it replaces the plain success toast of the store). The column layout prints a visible helper line.
- **`<FullResolutionDialog deviceId open onOpenChange />`**: four expanded-card steps (`StepCard`, `FullResolutionCards`): ① Was passiert? ② Einstellungen prüfen (memory depth, channel chips, duration range from `estimate.ts`, "Acquire → Mem Depth") ③ Lesen (determinate `Progress` from the `full-resolution` job, else indeterminate with elapsed time; "Abbrechen") ④ Fertig / Abgebrochen / error with "Erneut versuchen". Closing keeps the job running (it stays in the status bar); reopening shows the progress again.
- **`<LastCaptureCard deviceId layout? />`** (`"card"` | `"compact"`): "Aufnahme #5 · 14:02:11", coloured channel chips, "Volle Auflösung" badge, note field `#capture-note-input` (draft is local state keyed by `acquisitionId`; saves on Enter, blur or "Notiz speichern"; status ✓/⚠) and the checkbox "Zum Hochladen auswählen". Read-only unless the lock is held; empty state "Noch keine Aufnahme gespeichert."
- **`<LiveStatusBadge deviceId />`** (`status/`): pulsing "LIVE · aktualisiert vor 0,8 s", amber "veraltet" after 3 s, "pausiert", hidden when live is off; the age ticks on a local 250 ms timer (`useNow`).
- **`<StatusBar deviceId className? />`**: running job (label, determinate bar or spinner + elapsed, "Abbrechen" for the cancellable full-resolution read), else the result of the job that just finished (dismissable, the store drops it after 5 s), else the busy label, else "Bereit"; `aria-live="polite"`, compact below container width `md`/`lg` (container queries).

Tests: `actions/LiveControls.test.tsx`, `actions/useControlShortcuts.test.tsx`, `capture/{CaptureButton,LastCaptureCard,FullResolutionDialog}.test.tsx`, `status/StatusBar.test.tsx` (StatusBar, LiveStatusBadge, `formatAge`).

## Archive, upload & Meine Messdaten

Strings: `src/i18n/de/archive.ts` (`de.archive.*`, wizard under `de.archive.wizard`, sessions under `de.archive.sessions`).
Glossary: *Aufnahme* (all channels of one acquisition or one screenshot), *Kanalspur* (one channel), *Serie* (run group), *Hochladen*.

**`pages/DataArchive.tsx`** (`/archive/:sessionId`, exports `DataArchive`) — header (`archive/ArchiveHeader`: back to `/device/:id` while the session is active else `/sessions`, refresh, `<ExportMenu>` for the upload selection, "Alle als ZIP" = server ZIP of the whole session without a client cap, primary "Hochladen (n)" which opens the wizard), a summary/select bar, the timeline table and the preview. From 1280 px the preview sits next to the list (split view, Esc clears it); narrower it opens in a `Dialog` (Esc, focus trap). ←/→ step through captures in list order (stepping into a collapsed series expands it).

| File (`pages/archive/`) | Role |
| --- | --- |
| `groupArtifacts.ts` | Pure: `buildTimeline(artifacts)` → `{days, captures}`; captures merge traces by `acquisition_id` (screenshots and legacy traces are single captures), series = runs with ≥ 2 captures numbered oldest-first, one timeline newest first, day groups. `statusOf` (selected > uploaded > local), `selectionState`, `countByStatus`, immutable `withPersist` / `restorePersist` / `withAnnotation`. Tested in `groupArtifacts.test.ts`. |
| `useArchive.ts` | Loads artifacts; `setUploadSelection(captures, wanted)` (optimistic `flagArtifact` per artifact, rollback + `notifyError` + re-sync on any failure) and `saveNote` (optimistic `setAnnotation`, rollback + toast). |
| `ArchiveTable.tsx`, `ArchiveRows.tsx` | Real `<table>` (fixed column widths): Hochladen · Zeit · Kanäle · Notiz · Status · Aktionen; `DayRow` (date once per day), `SeriesRow` (collapsible "Serie n", tri-state checkbox), `CaptureRow`. Uploaded captures have a disabled checkbox (reason as title); "Erneut hochladen" is in the row menu. |
| `UploadCheckbox`, `StatusChip` (Lokal / Zum Hochladen ausgewählt / Hochgeladen ✓, icon + text), `ChannelChips` (`channelColor` chips, screenshot thumbnail), `NoteCell` (inline edit: Enter/blur saves, Esc cancels) | Row building blocks. |
| `CapturePreview.tsx`, `PreviewDialog.tsx`, `PreviewPlaceholder.tsx` | Preview body (`WaveformPlot` with `yMode="volts"`, `MeasurementTable level="basic"`, note, `ExportMenu` of that capture, prev/next, or the screenshot image) and its Dialog wrapper. |
| `usePreviewData.ts` (12-entry LRU of loaded traces), `usePreviewKeys.ts`, `useScreenshotUrls.ts`, `useSessionInfo.ts` (device/`is_active` from `listMySessions`), `useMediaQuery.ts` | Hooks. |

**Upload wizard** (`components/upload/`, opened from the archive header): `UploadWizard` is a Dialog (full screen below 640 px) with `Stepper` and one component per step — `ReviewStep` ① (untick captures → `artifact_ids`), `TargetStep` ② (`components/OpenBISObjectSelector` Gruppe → Versuch → Probe/Objekt, manual identifier under "Erweitert: Kennung manuell eingeben"; a load error switches to manual entry), `DetailsStep` ③ (Praktikum from `useAppConfig().lab_courses` with `FALLBACK_LAB_COURSES`, Versuchstitel, Beschreibung, Messobjekt, Notizen; openBIS property names only in `HelpPopover`), `ConfirmStep` ④ (summary + "Jetzt hochladen"), `ResultStep` ⑤ (indeterminate progress; "✓ n Aufnahmen hochgeladen" + "In openBIS öffnen ↗" from `openbis_url` or the dropbox note; error panel with "Erneut versuchen"). State lives in `wizardReducer.ts` (`wizardReducer`, `initialWizardState`, `stepIssue` = reason shown next to the disabled "Weiter", `buildCommitRequest`); after success the archive refreshes so rows show "Hochgeladen ✓" and the selection is empty (no double upload). `OpenBISObjectSelector` is controlled (`ObjectSelection`); `resolveSelection` fills labels/identifiers of remembered codes in one pass.
`rememberedMetadata.ts` keeps the form per user (`localStorage` key `osc_upload_prefs:<user_id>`, all access in try/catch): each field has a "merken" pin (`RememberToggle`); pinned fields (default: Ziel, Praktikum, Titel, Beschreibung) are pre-filled next time, unpinned ones are cleared. Saved on successful upload. Tests: `wizardReducer.test.ts`, `rememberedMetadata.test.ts`, `OpenBISObjectSelector.test.ts`.

**`pages/MySessions.tsx`** (`/sessions`, exports `MySessions`) — `listMySessions` grouped by day (`sessions/groupSessions.ts`, tested), rows (`sessions/SessionRow.tsx`) with device, start time, counts ("5 Aufnahmen · 2 ausgewählt · 3 hochgeladen"), status chip (Aktiv / Alles hochgeladen ✓ / n nicht hochgeladen / Leer) and "Öffnen"; a retention note using `useAppConfig().eod_reset_time`; empty state linking to the device list.
