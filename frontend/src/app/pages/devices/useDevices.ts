import { useCallback, useEffect, useRef, useState } from "react";
import { listDevices } from "../../../api/devices";
import { subscribeDeviceEvents } from "../../../api/events";
import type { Device, DeviceEvent } from "../../../api/types";
import { de } from "../../../i18n/de";

/** Poll interval used only while the SSE stream is disconnected. */
const POLL_MS = 5_000;

export interface UseDevicesResult {
  devices: Device[];
  /** True until the first response (or error) arrived. */
  isLoading: boolean;
  /** True while a (re)load is running. */
  isRefreshing: boolean;
  /** Message of the last failed load, null after a successful one. */
  error: string | null;
  /** True while the SSE stream is open (live updates instead of polling). */
  live: boolean;
  /** Reloads the list; rejects on failure so callers can toast. */
  refresh: () => Promise<void>;
}

/** Applies one SSE event to the device list; lock changes are resolved by the caller via refetch. */
function applyEvent(devices: Device[], event: DeviceEvent): Device[] {
  if (event.type !== "device_state") return devices;
  return devices.map((d) =>
    d.id === event.device_id ? { ...d, state: event.state, last_error: event.last_error } : d,
  );
}

/**
 * Keeps the device list current: loads once, then follows the SSE stream
 * (`device_state` applied in place, `lock` events trigger a refetch because
 * `is_mine` is per user). Polls every 5 s only while SSE is disconnected.
 *
 * @param token - Bearer token, or null when logged out
 * @returns The list plus loading/error/connection state and a manual refresh
 */
export function useDevices(token: string | null): UseDevicesResult {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const inFlight = useRef(false);
  const queued = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (!token) return;
    if (inFlight.current) {
      queued.current = true; // run once more afterwards so a late event is never lost
      return;
    }
    inFlight.current = true;
    setIsRefreshing(true);
    const outcome: { failure: unknown } = { failure: null };
    try {
      do {
        queued.current = false;
        try {
          const data = await listDevices(token);
          setDevices(Array.isArray(data) ? data : []);
          setError(null);
          outcome.failure = null;
        } catch (err) {
          outcome.failure = err;
          setError(err instanceof Error && err.message ? err.message : de.devices.loadError);
        }
      } while (queued.current);
    } finally {
      inFlight.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
    }
    if (outcome.failure) throw outcome.failure;
  }, [token]);

  const refresh = load;

  // Initial load.
  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  // SSE subscription.
  useEffect(() => {
    if (!token) return;
    return subscribeDeviceEvents(
      token,
      (event) => {
        if (event.type === "lock") void load().catch(() => {});
        else setDevices((prev) => applyEvent(prev, event));
      },
      (connected) => {
        setLive(connected);
        if (connected) void load().catch(() => {}); // resync after (re)connect
      },
    );
  }, [token, load]);

  // Polling fallback while SSE is down.
  useEffect(() => {
    if (live) return;
    const timer = setInterval(() => void load().catch(() => {}), POLL_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  return { devices, isLoading, isRefreshing, error, live, refresh };
}
