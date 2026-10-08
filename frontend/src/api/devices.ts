import { apiBaseUrl, apiFetch } from "./client";
import {
  AcquireResponseSchema,
  CancelAcquireResponseSchema,
  DeviceDetailSchema,
  DeviceSchema,
  DeviceSettingsSchema,
  KeyboardLockResponseSchema,
  LockResponseSchema,
  MemoryDepthResponseSchema,
  PreviewResponseSchema,
  SaveScreenshotResponseSchema,
  WaveformDataSchema,
} from "./schemas";
import { parseList, parseOrThrow } from "./validate";
import type {
  Device,
  DeviceDetail,
  LockResponse,
  AcquireResponse,
  WaveformData,
  PreviewResponse,
  DeviceSettings,
  MemoryDepthResponse,
  ChannelConfig,
  TimebaseConfig,
  TriggerConfig,
} from "./types";

/**
 * Retrieves a list of all available devices.
 * @param token - The authentication bearer token
 * @returns A promise resolving to the valid devices (malformed entries are logged and skipped)
 */
export function listDevices(token: string): Promise<Device[]> {
  return apiFetch<unknown>("/devices", token).then((raw) =>
    parseList(DeviceSchema, raw, "GET /devices"),
  );
}

/**
 * Retrieves detailed information about a specific device.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @returns A promise resolving to detailed device information
 */
export function getDevice(
  token: string,
  deviceId: string,
): Promise<DeviceDetail> {
  return apiFetch<unknown>(`/devices/${deviceId}`, token).then((raw) =>
    parseOrThrow(DeviceDetailSchema, raw, "GET /devices/{id}"),
  );
}

/**
 * Acquires an exclusive lock on a device for the current session.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device to lock
 * @returns A promise resolving to lock response containing session ID
 */
export function acquireLock(
  token: string,
  deviceId: string,
): Promise<LockResponse> {
  return apiFetch<unknown>(`/devices/${deviceId}/lock`, token, {
    method: "POST",
  }).then((raw) =>
    parseOrThrow(LockResponseSchema, raw, "POST /devices/{id}/lock"),
  );
}

/**
 * Releases an exclusive lock on a device.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device to unlock
 * @param sessionId - The session ID associated with the lock
 * @returns A promise that resolves when the lock is released
 */
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

/**
 * Soft-releases the lock when the page unloads: the lock stays reclaimable by
 * the same user for `lock_soft_release_seconds` (so F5 does not drop control).
 * Uses `fetch(keepalive)` because `sendBeacon` cannot send the auth header.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 */
export function softReleaseLockOnUnload(
  token: string,
  deviceId: string,
  sessionId: string,
): void {
  fetch(
    `${apiBaseUrl}api/devices/${deviceId}/unlock?session_id=${encodeURIComponent(sessionId)}&soft=true`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    },
  ).catch(() => {});
}

/**
 * Sends a heartbeat to keep a device lock active.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @returns A promise that resolves when the heartbeat is sent
 */
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

/**
 * Starts measurement acquisition on a device.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @returns A promise that resolves when the device starts running
 */
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

/**
 * Stops measurement acquisition on a device.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @returns A promise that resolves when the device stops
 */
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

/** Options for {@link acquireWaveforms}. */
export interface AcquireOptions {
  /** Channel numbers to acquire; defaults to the channels enabled on the scope. */
  channels?: number[];
  /** Read the full acquisition memory ("Volle Auflösung") instead of the screen buffer. */
  maxSamples?: boolean;
  /** Optional UUID grouping captures of one series ("Serie"). */
  runId?: string | null;
  /** Return the sample arrays inline (saves one request per channel). */
  includeData?: boolean;
}

/**
 * Saves a capture ("Aufnahme") of all requested channels to the session archive.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @param options - Channel selection, depth, series grouping and inline data
 * @returns A promise resolving to the stored acquisition with applied settings
 */
export function acquireWaveforms(
  token: string,
  deviceId: string,
  sessionId: string,
  options: AcquireOptions = {},
): Promise<AcquireResponse> {
  const params = new URLSearchParams({
    session_id: sessionId,
    max_samples: String(options.maxSamples ?? false),
    include_data: String(options.includeData ?? false),
  });
  options.channels?.forEach((ch) => params.append("channels", String(ch)));
  if (options.runId) params.set("run_id", options.runId);
  return apiFetch<unknown>(`/devices/${deviceId}/acquire?${params}`, token, {
    method: "POST",
  }).then((raw) =>
    parseOrThrow(AcquireResponseSchema, raw, "POST /devices/{id}/acquire"),
  );
}

/**
 * Reads one live frame for display only — nothing is written to the archive.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @param channels - Optional channel numbers; defaults to the enabled channels
 * @returns A promise resolving to the frame data plus the applied settings
 */
export function previewWaveforms(
  token: string,
  deviceId: string,
  sessionId: string,
  channels?: number[],
): Promise<PreviewResponse> {
  const params = new URLSearchParams({ session_id: sessionId });
  channels?.forEach((ch) => params.append("channels", String(ch)));
  return apiFetch<unknown>(`/devices/${deviceId}/preview?${params}`, token, {
    method: "POST",
  }).then((raw) =>
    parseOrThrow(PreviewResponseSchema, raw, "POST /devices/{id}/preview"),
  );
}

/**
 * Asks the backend to abort the running full-memory acquisition. The pending
 * acquire request then fails with error code `acquisition_cancelled`.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @returns A promise resolving to whether an acquisition was running
 */
export function cancelAcquire(
  token: string,
  deviceId: string,
  sessionId: string,
): Promise<{ cancelled: boolean }> {
  return apiFetch<unknown>(
    `/devices/${deviceId}/acquire/cancel?session_id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "POST" },
  ).then((raw) =>
    parseOrThrow(
      CancelAcquireResponseSchema,
      raw,
      "POST /devices/{id}/acquire/cancel",
    ),
  );
}

/** Scope commands without payload, gated by the matching capability. */
export type ScopeCommand = "single" | "force-trigger" | "autoscale";

/**
 * Sends a payload-free command to the scope: `single` (arm one trigger),
 * `force-trigger` (trigger now) or `autoscale` (scope Auto-Setup).
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @param command - The command path segment
 * @returns A promise that resolves when the scope accepted the command
 */
export function sendScopeCommand(
  token: string,
  deviceId: string,
  sessionId: string,
  command: ScopeCommand,
): Promise<void> {
  return apiFetch<void>(
    `/devices/${deviceId}/${command}?session_id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "POST" },
  );
}

/**
 * Retrieves waveform data for a specific channel.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param channel - The channel number to retrieve data from
 * @param sessionId - The session ID associated with the lock
 * @returns A promise resolving to the waveform data for the channel
 */
export function getChannelData(
  token: string,
  deviceId: string,
  channel: number,
  sessionId: string,
): Promise<WaveformData> {
  return apiFetch<unknown>(
    `/devices/${deviceId}/channels/${channel}/data?session_id=${encodeURIComponent(sessionId)}`,
    token,
  ).then((raw) =>
    parseOrThrow(
      WaveformDataSchema,
      raw,
      "GET /devices/{id}/channels/{n}/data",
    ),
  );
}

/**
 * Retrieves the current settings and configuration of a device.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @returns A promise resolving to the device settings
 */
export function getSettings(
  token: string,
  deviceId: string,
): Promise<DeviceSettings> {
  return apiFetch<unknown>(`/devices/${deviceId}/settings`, token).then((raw) =>
    parseOrThrow(DeviceSettingsSchema, raw, "GET /devices/{id}/settings"),
  );
}

/**
 * Updates the configuration for a specific channel.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param channel - The channel number to configure
 * @param sessionId - The session ID associated with the lock
 * @param config - The new channel configuration
 * @returns A promise that resolves when the configuration is updated
 */
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
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    },
  );
}

/**
 * Configures the timebase settings for the device.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @param config - The timebase configuration (excludes auto-calculated sample_rate)
 * @returns A promise that resolves when the timebase is configured
 */
export function setTimebase(
  token: string,
  deviceId: string,
  sessionId: string,
  config: Omit<TimebaseConfig, "sample_rate">,
): Promise<void> {
  return apiFetch<void>(
    `/devices/${deviceId}/timebase?session_id=${encodeURIComponent(sessionId)}`,
    token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    },
  );
}

/**
 * Configures the trigger settings for the device.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @param config - The trigger configuration
 * @returns A promise that resolves when the trigger is configured
 */
export function setTrigger(
  token: string,
  deviceId: string,
  sessionId: string,
  config: TriggerConfig,
): Promise<void> {
  return apiFetch<void>(
    `/devices/${deviceId}/trigger?session_id=${encodeURIComponent(sessionId)}`,
    token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    },
  );
}

/**
 * Retrieves a screenshot from the device display (live display, not saved to buffer).
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @returns A promise resolving to a PNG image Blob
 */
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

/**
 * Captures a screenshot and saves it to the buffer.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @returns A promise resolving to the saved artifact ID
 */
export function saveScreenshot(
  token: string,
  deviceId: string,
  sessionId: string,
): Promise<{ artifact_id: string }> {
  return apiFetch<unknown>(
    `/devices/${deviceId}/screenshot?session_id=${encodeURIComponent(sessionId)}`,
    token,
    { method: "POST" },
  ).then((raw) =>
    parseOrThrow(
      SaveScreenshotResponseSchema,
      raw,
      "POST /devices/{id}/screenshot",
    ),
  );
}

/**
 * Retrieves the current acquisition memory depth for a device.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @returns A promise resolving to the memory depth in samples
 */
export function getMemoryDepth(
  token: string,
  deviceId: string,
): Promise<MemoryDepthResponse> {
  return apiFetch<unknown>(`/devices/${deviceId}/memory-depth`, token).then(
    (raw) =>
      parseOrThrow(
        MemoryDepthResponseSchema,
        raw,
        "GET /devices/{id}/memory-depth",
      ),
  );
}

/**
 * Lock or unlock the physical front-panel keys on a device (admin only).
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param locked - True to lock the keys, false to unlock
 * @returns A promise resolving to the new keyboard lock state
 */
export function setKeyboardLock(
  token: string,
  deviceId: string,
  locked: boolean,
): Promise<{ device_id: string; keyboard_locked: boolean }> {
  return apiFetch<unknown>(
    `/admin/devices/${deviceId}/keyboard-lock?locked=${locked}`,
    token,
    { method: "POST" },
  ).then((raw) =>
    parseOrThrow(
      KeyboardLockResponseSchema,
      raw,
      "POST /admin/devices/{id}/keyboard-lock",
    ),
  );
}
