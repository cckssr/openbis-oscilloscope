import { apiFetch } from "./client";
import type {
  Device,
  DeviceDetail,
  LockResponse,
  AcquireResponse,
  WaveformData,
  DeviceSettings,
  ChannelConfig,
  TimebaseConfig,
  TriggerConfig,
} from "./types";

export function listDevices(token: string): Promise<Device[]> {
  return apiFetch<Device[]>("/devices", token);
}

export function getDevice(token: string, deviceId: string): Promise<DeviceDetail> {
  return apiFetch<DeviceDetail>(`/devices/${deviceId}`, token);
}

export function acquireLock(token: string, deviceId: string): Promise<LockResponse> {
  return apiFetch<LockResponse>(`/devices/${deviceId}/lock`, token, {
    method: "POST",
  });
}

export function releaseLock(
  token: string,
  deviceId: string,
  sessionId: string,
): Promise<void> {
  return apiFetch<void>(
    `/devices/${deviceId}/unlock?session_id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "POST" },
  );
}

export function sendHeartbeat(
  token: string,
  deviceId: string,
  sessionId: string,
): Promise<void> {
  return apiFetch<void>(
    `/devices/${deviceId}/heartbeat?session_id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "POST" },
  );
}

export function runDevice(
  token: string,
  deviceId: string,
  sessionId: string,
): Promise<void> {
  return apiFetch<void>(
    `/devices/${deviceId}/run?session_id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "POST" },
  );
}

export function stopDevice(
  token: string,
  deviceId: string,
  sessionId: string,
): Promise<void> {
  return apiFetch<void>(
    `/devices/${deviceId}/stop?session_id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "POST" },
  );
}

export function acquireWaveforms(
  token: string,
  deviceId: string,
  sessionId: string,
): Promise<AcquireResponse> {
  return apiFetch<AcquireResponse>(
    `/devices/${deviceId}/acquire?session_id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "POST" },
  );
}

export function getChannelData(
  token: string,
  deviceId: string,
  channel: number,
  sessionId: string,
): Promise<WaveformData> {
  return apiFetch<WaveformData>(
    `/devices/${deviceId}/channels/${channel}/data?session_id=${encodeURIComponent(sessionId)}`,
    token,
  );
}

export function getSettings(
  token: string,
  deviceId: string,
): Promise<DeviceSettings> {
  return apiFetch<DeviceSettings>(`/devices/${deviceId}/settings`, token);
}

export function setChannelConfig(
  token: string,
  deviceId: string,
  channel: number,
  sessionId: string,
  config: ChannelConfig,
): Promise<void> {
  return apiFetch<void>(
    `/devices/${deviceId}/channels/${channel}/config?session_id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) },
  );
}

export function setTimebase(
  token: string,
  deviceId: string,
  sessionId: string,
  config: Omit<TimebaseConfig, "sample_rate">,
): Promise<void> {
  return apiFetch<void>(
    `/devices/${deviceId}/timebase?session_id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) },
  );
}

export function setTrigger(
  token: string,
  deviceId: string,
  sessionId: string,
  config: TriggerConfig,
): Promise<void> {
  return apiFetch<void>(
    `/devices/${deviceId}/trigger?session_id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) },
  );
}

/** Returns a raw PNG Blob. */
export function getScreenshot(
  token: string,
  deviceId: string,
  sessionId: string,
): Promise<Blob> {
  return apiFetch<Blob>(
    `/devices/${deviceId}/screenshot?session_id=${encodeURIComponent(sessionId)}`,
    token,
  );
}
