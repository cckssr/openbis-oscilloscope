/** Shapes that mirror the FastAPI response dicts exactly. */

export interface UserInfo {
  user_id: string;
  display_name: string;
  is_admin: boolean;
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

export interface DeviceDetail extends Device {
  /** Non-empty only when the device driver is connected */
  capabilities: string[];
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

export interface AcquireResponse {
  artifact_ids: string[];
  acquisition_id: string;
  session_id: string;
  channels: AcquiredChannel[];
}

export interface WaveformData {
  artifact_id: string;
  channel: number;
  time_s: number[];
  voltage_V: number[];
}

export type ArtifactType = "trace" | "screenshot";

export interface Artifact {
  artifact_id: string;
  artifact_type: ArtifactType;
  channel: number | null;
  seq: number;
  persist: boolean;
  created_at: string;
  files: string[];
  acquisition_id: string | null;
  annotation: string | null;
  run_id: string | null;
}

export interface CommitResponse {
  permId: string;
  artifact_count: number;
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
  /** Keyed by channel number (1–4) */
  channels: Record<number, ChannelConfig>;
  timebase: TimebaseConfig;
  trigger: TriggerConfig;
}
