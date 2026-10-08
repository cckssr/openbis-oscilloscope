import { useMemo } from "react";
import {
  useDeviceSessionSelector,
  type Capture,
  type DeviceSessionState,
  type Frame,
  type SettingsSnapshot,
} from "../../../state/deviceSession";
import { buildPlotOverlays } from "./overlays";

/** Jobs that dim the plot while they run. */
const SAVING_KINDS = new Set(["capture", "full-resolution", "screenshot"]);

interface Slice {
  frame: Frame | null;
  applied: SettingsSnapshot | null;
  lastCapture: Capture | null;
  saving: boolean;
  sessionId?: string;
  scopeMemoryDepth: number | null;
}

const select = (s: DeviceSessionState): Slice => ({
  frame: s.frame,
  applied: s.settings.applied,
  lastCapture: s.lastCapture,
  saving: s.jobs.some((j) => j.status === "running" && SAVING_KINDS.has(j.kind)),
  sessionId: s.lock.sessionId ?? s.lock.previousSessionId,
  scopeMemoryDepth: s.memoryDepth,
});

const same = (a: Slice, b: Slice) => (Object.keys(a) as (keyof Slice)[]).every((k) => Object.is(a[k], b[k]));

/**
 * Everything the plot region renders, derived from the session (re-renders
 * only when one of these pieces changes).
 * @param deviceId - The device
 * @returns Frame, overlays, memory depth, export context and the saving flag
 */
export function usePlotModel(deviceId: string) {
  const s = useDeviceSessionSelector(deviceId, select, same);
  const overlays = useMemo(() => buildPlotOverlays(s.frame, s.applied), [s.frame, s.applied]);
  const shownCapture = s.frame && s.lastCapture && s.frame === s.lastCapture.frame ? s.lastCapture : null;
  return {
    frame: s.frame,
    overlays,
    saving: s.saving,
    shownCapture,
    sessionId: s.sessionId,
    // Depth of the data on display; the scope's setting is only a fallback.
    memoryDepth: s.frame?.memoryDepth ?? s.scopeMemoryDepth ?? undefined,
  };
}
