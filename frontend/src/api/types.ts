/** Shapes that mirror the FastAPI response dicts exactly. */

export interface UserInfo {
  user_id: string;
  display_name: string;
  is_admin: boolean;
}

/** Public, unauthenticated runtime configuration (`GET /config`). */
export interface AppConfig {
  debug: boolean;
  version: string;
  /** Base URL of the openBIS server, empty when not configured. */
  openbis_url: string;
  lab_courses: { value: string; label: string }[];
  lock_ttl_seconds: number;
  /** Seconds a lock stays reclaimable after a soft release (page unload). */
  lock_soft_release_seconds: number;
  /** Local time of the end-of-day lock reset, "HH:MM". */
  eod_reset_time: string;
  eod_timezone: string;
}

export interface LockInfo {
  owner_user: string;
  acquired_at: number;
  /** true when the authenticated user is the current lock holder */
  is_mine: boolean;
  /** only present when is_mine is true — allows reclaiming control after logout/login */
  session_id?: string;
}

export type DeviceState = "OFFLINE" | "ONLINE" | "LOCKED" | "BUSY" | "ERROR";

export interface Device {
  id: string;
  label: string;
  ip: string;
  port: number;
  state: DeviceState;
  last_error: string | null;
  lock: LockInfo | null;
}

/**
 * Driver capability names reported by `GET /devices/{id}`. A control is only
 * rendered when its capability is present.
 */
export type Capability =
  | "run"
  | "stop"
  | "acquire"
  | "preview"
  | "screenshot"
  | "single"
  | "force_trigger"
  | "autoscale"
  | "cancel_acquire";

export interface DeviceDetail extends Device {
  /** Non-empty only when the device driver is connected */
  capabilities: Capability[];
  /** Number of analog input channels on the scope (default 4). */
  channel_count: number;
}

export interface LockResponse {
  control_session_id: string;
  device_id: string;
}

export interface AcquiredChannel {
  channel: number;
  enabled: boolean;
  scale_v_div: number;
  offset_v: number;
  coupling: "DC" | "AC" | "GND";
  probe_attenuation: number;
}

/** Raw samples of one channel. `artifact_id` is null for unsaved preview frames. */
export interface WaveformData {
  artifact_id: string | null;
  channel: number;
  time_s: number[];
  voltage_V: number[];
}

/** Response of `POST /devices/{id}/preview` — a live frame that is NOT stored. */
export interface PreviewResponse {
  channels: AcquiredChannel[];
  waveforms: WaveformData[];
  timebase: TimebaseConfig;
  trigger: TriggerConfig;
}

/** Response of `POST /devices/{id}/acquire` — a saved capture ("Aufnahme"). */
export interface AcquireResponse {
  artifact_ids: string[];
  acquisition_id: string;
  session_id: string;
  created_at: string;
  channels: AcquiredChannel[];
  timebase: TimebaseConfig;
  trigger: TriggerConfig;
  /** Only present when requested with `include_data=true`. */
  waveforms?: WaveformData[];
}

/** SSE events from `GET /devices/events`. */
export type DeviceEvent =
  | {
      type: "device_state";
      device_id: string;
      state: DeviceState;
      last_error: string | null;
    }
  | {
      type: "lock";
      device_id: string;
      owner_user: string | null;
      session_id: string | null;
    }
  | {
      type: "progress";
      device_id: string;
      session_id: string;
      job: "acquire";
      /** Overall fraction 0..1 across all channels. */
      done: number;
      /** Human-readable step, e.g. "CH2: 1,2 / 6 MPkt". */
      detail: string;
    };

export type ArtifactType = "trace" | "screenshot";

export interface Artifact {
  artifact_id: string;
  artifact_type: ArtifactType;
  channel: number | null;
  seq: number;
  /** Selected ("markiert") for the next upload. */
  persist: boolean;
  created_at: string;
  files: string[];
  acquisition_id: string | null;
  annotation: string | null;
  run_id: string | null;
  uploaded: boolean;
  uploaded_at: string | null;
  perm_id: string | null;
}

/** One row of `GET /sessions?mine=true` ("Meine Messdaten"). */
export interface SessionSummary {
  session_id: string;
  device_id: string;
  device_label: string;
  owner_user: string;
  created_at: string;
  last_activity: string;
  /** True while this session still holds the device lock. */
  is_active: boolean;
  counts: {
    acquisitions: number;
    screenshots: number;
    flagged: number;
    uploaded: number;
  };
}

export interface CommitResponse {
  /** null when committed via the dropbox (registration happens asynchronously). */
  permId: string | null;
  artifact_count: number;
  artifact_ids: string[];
  /** Deep link to the dataset in the openBIS ELN, null if unknown. */
  openbis_url: string | null;
  dropbox_file?: string;
}

// ---------------------------------------------------------------------------
// Settings types (mirror base_driver dataclasses)
// ---------------------------------------------------------------------------

export interface ChannelConfig {
  enabled: boolean;
  scale_v_div: number;
  offset_v: number;
  coupling: "DC" | "AC" | "GND";
  probe_attenuation: number;
}

export interface TimebaseConfig {
  scale_s_div: number;
  offset_s: number;
  /** Read-only — returned by GET /settings but ignored by PUT /timebase */
  sample_rate: number;
}

export interface TriggerConfig {
  source: string;
  level_v: number;
  slope: "RISE" | "FALL" | "EITHER";
  mode: "AUTO" | "NORMAL" | "SINGLE";
}

export interface DeviceSettings {
  /** Keyed by channel number (1..channel_count) */
  channels: Record<number, ChannelConfig>;
  timebase: TimebaseConfig;
  trigger: TriggerConfig;
}

export interface MemoryDepthResponse {
  device_id: string;
  memory_depth: number;
}
