import type { TriggerConfig, TimebaseConfig } from "../../../../api/types";
import type { Overlay, Trace } from "../../../../lib/trace";
import type { Frame, SettingsSnapshot } from "../../../state/deviceSession";

/**
 * Overlays drawn on the plot: trigger level on the trigger source trace and
 * the trigger time marker. Always from settings the scope confirmed, never
 * from pending edits (review §2.3, A-review): a live frame uses the applied
 * settings, a saved capture the settings it was recorded with.
 *
 * @param frame - Frame on display (null when empty)
 * @param applied - Applied settings, if loaded
 * @returns Overlays (empty when nothing can be placed)
 */
export function buildPlotOverlays(frame: Frame | null, applied: SettingsSnapshot | null): Overlay[] {
  if (!frame || frame.traces.length === 0) return [];
  const useApplied = frame.source === "live" && applied !== null;
  const trigger: TriggerConfig = useApplied ? applied.trigger : frame.trigger;
  const offsetS: number = useApplied
    ? (applied.timebase as TimebaseConfig).offset_s
    : frame.timebase.offsetS;

  const overlays: Overlay[] = [];
  const source: Trace | undefined = frame.traces.find((t) => t.id === trigger.source);
  if (source) overlays.push({ kind: "trigger-level", traceId: source.id, value: trigger.level_v });
  if (Number.isFinite(offsetS)) overlays.push({ kind: "trigger-time", value: offsetS });
  return overlays;
}
