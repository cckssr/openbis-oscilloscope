/** Initial state of a device session store. */
import type { DeviceSessionState } from "./types";

/**
 * Builds the empty state of a store that has not talked to the backend yet.
 * @param deviceId - The device the store belongs to
 * @returns A fresh state: no lock, no live view, no data
 */
export function createInitialState(deviceId: string): DeviceSessionState {
  return {
    deviceId,
    device: null,
    capabilities: [],
    channelCount: 0,
    lock: { status: "none" },
    live: { status: "off" },
    series: { status: "off", count: 0 },
    settings: {
      applied: null,
      pending: {},
      status: {},
      loading: false,
      touched: false,
    },
    frame: null,
    lastCapture: null,
    counts: {
      total: 0,
      withNoteOrFlag: 0,
      flagged: 0,
      uploaded: 0,
      notUploaded: 0,
    },
    memoryDepth: null,
    jobs: [],
    busy: null,
  };
}
