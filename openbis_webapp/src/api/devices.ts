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

/**
 * Retrieves a list of all available devices.
 * @param token - The authentication bearer token
 * @returns A promise resolving to an array of devices
 */
export function listDevices(token: string): Promise<Device[]> {
  return apiFetch<Device[]>("/devices", token);
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
  return apiFetch<DeviceDetail>(`/devices/${deviceId}`, token);
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
  return apiFetch<LockResponse>(`/devices/${deviceId}/lock`, token, {
    method: "POST",
  });
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

/**
 * Acquires waveforms from the device.
 * @param token - The authentication bearer token
 * @param deviceId - The unique identifier of the device
 * @param sessionId - The session ID associated with the lock
 * @returns A promise resolving to the acquisition response with waveform metadata
 */
export function acquireWaveforms(
  token: string,
  deviceId: string,
  sessionId: string,
  channels?: number[],
): Promise<AcquireResponse> {
  const params = new URLSearchParams({ session_id: sessionId });
  channels?.forEach((ch) => params.append("channels", String(ch)));
  return apiFetch<AcquireResponse>(
    `/devices/${deviceId}/acquire?${params}`,
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
  return apiFetch<WaveformData>(
    `/devices/${deviceId}/channels/${channel}/data?session_id=${encodeURIComponent(sessionId)}`,
    token,
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
  return apiFetch<DeviceSettings>(`/devices/${deviceId}/settings`, token);
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
 * Retrieves a screenshot from the device display.
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
