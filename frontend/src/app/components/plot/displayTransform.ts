/**
 * Maps trace values to the plot's y axis. In "divisions" mode every channel is
 * drawn where it appears on the scope screen: `(v + offset) / perDiv`.
 */
import type { Trace } from "../../../lib/trace";

export type YMode = "divisions" | "volts";

/**
 * Chooses the y mode: the explicit prop wins; otherwise "divisions" when every
 * trace carries a scope scale (or there is nothing to draw yet).
 * @param traces - Traces to display
 * @param requested - The `yMode` prop
 * @param hasTimebase - Whether a scope frame is known (empty plot shows the scope grid)
 * @returns The mode to use
 */
export function resolveYMode(traces: Trace[], requested: YMode | undefined, hasTimebase: boolean): YMode {
  if (requested) return requested;
  if (traces.length === 0) return hasTimebase ? "divisions" : "volts";
  return traces.every((t) => t.scale && t.yUnit === "V" && t.xUnit === "s") ? "divisions" : "volts";
}

/**
 * Converts a real value of a trace into the y axis coordinate.
 * @param trace - The trace the value belongs to
 * @param mode - Current y mode
 * @param value - Value in the trace's unit (e.g. volts)
 * @returns Divisions (divisions mode) or the value itself
 */
export function toDisplay(trace: Pick<Trace, "scale">, mode: YMode, value: number): number {
  if (mode !== "divisions") return value;
  const { perDiv, offset } = trace.scale ?? { perDiv: 1, offset: 0 };
  return (value + offset) / perDiv;
}

/**
 * Converts a whole sample array into y axis coordinates (new array in divisions mode).
 * @param trace - Source trace (for scale/offset)
 * @param mode - Current y mode
 * @param y - Sample values, possibly decimated
 * @returns Display coordinates
 */
export function toDisplayArray(trace: Pick<Trace, "scale">, mode: YMode, y: Float64Array): Float64Array {
  if (mode !== "divisions") return y;
  const { perDiv, offset } = trace.scale ?? { perDiv: 1, offset: 0 };
  const out = new Float64Array(y.length);
  for (let i = 0; i < y.length; i++) out[i] = (y[i] + offset) / perDiv;
  return out;
}
