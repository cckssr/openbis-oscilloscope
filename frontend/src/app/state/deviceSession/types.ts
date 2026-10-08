/**
 * Contract of the per-device session store (review §6.1). One store instance
 * per device lives above the router (see DeviceSessionProvider), so lock,
 * live view and the last capture survive navigation. The store owns all side
 * effects (heartbeat, live loop, SSE progress, tab coordination); components
 * only render state and call actions.
 */
import type {
  AcquiredChannel,
  Capability,
  ChannelConfig,
  DeviceDetail,
  TimebaseConfig,
  TriggerConfig,
} from "../../../api/types";
import type { Timebase, Trace } from "../../../lib/trace";

// ---------------------------------------------------------------------------
// Lock
// ---------------------------------------------------------------------------

/**
 * - `none`: nobody in this browser controls the device.
 * - `acquiring` / `releasing`: request in flight.
 * - `held`: this tab controls the device (heartbeat running).
 * - `passive`: the lock is ours but another tab of this browser controls it.
 * - `lost`: heartbeat failed / lock expired; all loops are stopped.
 */
export type LockStatus =
  | "none"
  | "acquiring"
  | "held"
  | "passive"
  | "releasing"
  | "lost";

export interface LockState {
  status: LockStatus;
  sessionId?: string;
  /** When control was taken (ms since epoch). */
  since?: number;
  /** German message for `lost` or a failed take/release. */
  error?: string;
  /** Session of the last release, so its archive stays reachable afterwards. */
  previousSessionId?: string;
}

// ---------------------------------------------------------------------------
// Live preview and series
// ---------------------------------------------------------------------------

/** `paused`: live was on but the control page is not visible (route left). */
export type LiveStatus = "off" | "starting" | "on" | "paused";

export interface LiveState {
  status: LiveStatus;
  /** Arrival time of the newest live frame (ms since epoch). */
  lastFrameAt?: number;
  error?: string;
}

/** "Serienaufnahme": saves a capture repeatedly, grouped by `runId`. */
export interface SeriesState {
  status: "off" | "on";
  runId?: string;
  /** Captures saved in the current series. */
  count: number;
}

// ---------------------------------------------------------------------------
// Settings (applied immediately, debounced, with per-control status)
// ---------------------------------------------------------------------------

/** Settings as the scope reports them. */
export interface SettingsSnapshot {
  /** Keyed by channel number 1..channel_count. */
  channels: Record<number, ChannelConfig>;
  timebase: TimebaseConfig;
  trigger: TriggerConfig;
}

/**
 * Dotted path of one setting:
 * `channels.<n>.<ChannelConfig key>`, `timebase.<key>` or `trigger.<key>`.
 */
export type SettingPath =
  | `channels.${number}.${keyof ChannelConfig & string}`
  | `timebase.${Exclude<keyof TimebaseConfig, "sample_rate"> & string}`
  | `trigger.${keyof TriggerConfig & string}`;

export type SettingValue = string | number | boolean;

export interface SettingStatus {
  /** `pending`: changed locally, waiting for the debounce. */
  state: "pending" | "applying" | "applied" | "error";
  error?: string;
  /** Last state change (ms since epoch) — lets "✓ übernommen" fade out. */
  at: number;
}

export interface SettingsState {
  /** Last state confirmed by the scope; null until loaded. Overlays and captures use this. */
  applied: SettingsSnapshot | null;
  /** Local values not yet confirmed, keyed by path. Controls show `pending ?? applied`. */
  pending: Partial<Record<SettingPath, SettingValue>>;
  status: Partial<Record<SettingPath, SettingStatus>>;
  loading: boolean;
  /** True once any setting was applied or Auto-Setup ran in this session (workflow step ②). */
  touched: boolean;
}

// ---------------------------------------------------------------------------
// Frames and captures
// ---------------------------------------------------------------------------

/** What the plot shows: the newest live frame or a saved capture. */
export interface Frame {
  source: "live" | "capture";
  traces: Trace[];
  channels: AcquiredChannel[];
  timebase: Timebase;
  trigger: TriggerConfig;
  /** Samples per channel. */
  memoryDepth: number;
  receivedAt: number;
}

/** One saved acquisition ("Aufnahme"). */
export interface Capture {
  acquisitionId: string;
  artifactIds: string[];
  createdAt: string;
  /** 1-based number within the session ("Aufnahme #5"). */
  number: number;
  /** Read with full memory depth ("Volle Auflösung"). */
  fullResolution: boolean;
  frame: Frame;
  note: string;
  /** Selected for upload ("Zum Hochladen ausgewählt"). */
  flagged: boolean;
  /** Just taken by the user in this tab (not a series step, not restored): the note field takes focus once. */
  fresh?: boolean;
}

/** Counts over all captures of the session (from the archive + this tab). */
export interface CaptureCounts {
  total: number;
  /** Not yet uploaded captures that have a note or are selected for upload. */
  withNoteOrFlag: number;
  flagged: number;
  uploaded: number;
  /** Captures that are neither uploaded nor explicitly left out. */
  notUploaded: number;
}

// ---------------------------------------------------------------------------
// Jobs (progress/feedback model, review §4.3)
// ---------------------------------------------------------------------------

export type JobKind =
  | "take-control"
  | "capture"
  | "full-resolution"
  | "screenshot"
  | "autoscale"
  | "series"
  | "command";

export interface Job {
  id: string;
  kind: JobKind;
  /** German, e.g. "Volle Auflösung wird gelesen…". */
  label: string;
  /** 0..1 when determinate. */
  progress?: number;
  detail?: string;
  startedAt: number;
  endedAt?: number;
  status: "running" | "done" | "error" | "cancelled";
  cancellable: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Store state and actions
// ---------------------------------------------------------------------------

export interface DeviceSessionState {
  deviceId: string;
  device: DeviceDetail | null;
  /** Load error of the device itself (unknown id, backend down). */
  deviceError?: string;
  capabilities: Capability[];
  channelCount: number;
  lock: LockState;
  live: LiveState;
  series: SeriesState;
  settings: SettingsState;
  /** Plot content; null shows the empty state. */
  frame: Frame | null;
  lastCapture: Capture | null;
  counts: CaptureCounts;
  /** Current acquisition memory depth of the scope (samples), if known. */
  memoryDepth: number | null;
  /** Running and recently finished jobs, newest first. */
  jobs: Job[];
  /**
   * Label of the serialized command in flight, or null. Only one device
   * command runs at a time (mirrors the backend queue); buttons disable with
   * this as the reason.
   */
  busy: string | null;
}

export interface DeviceSessionActions {
  /** Reload device info and capabilities; reclaims our own lock if the server still has it. */
  refreshDevice(): Promise<void>;
  /** "Gerät übernehmen": acquire the lock, or take over from another tab of this browser. */
  takeControl(): Promise<void>;
  /** "Gerät freigeben". The page asks for confirmation first when `counts.notUploaded > 0`. */
  release(): Promise<void>;

  /** ▶ Live starten: RUN on the scope + preview loop (nothing is stored). */
  startLive(): Promise<void>;
  /** ■ Live stoppen: ends the preview loop; the scope keeps running. */
  stopLive(): void;
  /** Called when the control page unmounts: pauses live; resumes via `resumeLive`. */
  pauseLive(): void;
  resumeLive(): void;
  /** Hardware STOP (also stops live and series). */
  stopScope(): Promise<void>;
  /** Arm one trigger (capability `single`). */
  single(): Promise<void>;
  /** Force a trigger now (capability `force_trigger`). */
  forceTrigger(): Promise<void>;
  /** Scope Auto-Setup (capability `autoscale`); reloads settings afterwards. */
  autoscale(): Promise<void>;

  /** "Aufnahme speichern": stops live if on, saves one capture, shows it in the plot. */
  saveCapture(): Promise<Capture | null>;
  /** Full-memory capture with progress (SSE) — cancellable via `cancelFullResolution`. */
  saveFullResolution(): Promise<Capture | null>;
  cancelFullResolution(): Promise<void>;
  /** Saves a screenshot of the scope display to the archive. */
  saveScreenshot(): Promise<{ artifactId: string } | null>;
  /** "Serienaufnahme": save a capture about once per second until stopped. */
  startSeries(): void;
  stopSeries(): void;

  /** Change one setting; applied to the scope after a short debounce. */
  setSetting(path: SettingPath, value: SettingValue): void;
  /** Re-read all settings from the scope. */
  reloadSettings(): Promise<void>;

  /** Note on the last capture (also flags it for upload when `flag` is true). */
  saveNote(text: string, flag?: boolean): Promise<void>;
  setCaptureFlag(flagged: boolean): Promise<void>;
  /** Re-count captures from the archive (after uploads in the archive page). */
  refreshCounts(): Promise<void>;

  dismissJob(id: string): void;
}

export interface DeviceSession {
  state: DeviceSessionState;
  actions: DeviceSessionActions;
}

// ---------------------------------------------------------------------------
// Workflow (review §4.1) — pure selector over the state
// ---------------------------------------------------------------------------

export type WorkflowStepId = "take" | "setup" | "capture" | "annotate" | "upload";

export interface WorkflowStep {
  id: WorkflowStepId;
  label: string;
  state: "todo" | "active" | "done" | "blocked";
  /** Optional steps (setup) can be skipped. */
  optional?: boolean;
}

export interface Workflow {
  steps: WorkflowStep[];
  /** One-sentence "Als Nächstes" hint, e.g. "Drücke „Live starten“, um das Signal zu sehen." */
  next: string;
}
