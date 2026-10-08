/**
 * Geometry shared by the plot, the cursor overlay and the readouts: fixed
 * plot margins (so overlays can map data to pixels without Plotly internals),
 * the scope-screen frame and data extents.
 */
import type { Timebase, Trace } from "../../../lib/trace";

/** Plot margins in px; fixed so HTML overlays line up with the plot area. */
export const MARGIN = { l: 64, r: 14, t: 10, b: 50 } as const;

/** Scope screen: 10 horizontal and 8 vertical divisions. */
export const X_DIVISIONS = 10;
export const Y_DIVISIONS = 8;

export type Range = [number, number];

/**
 * Smallest and largest x over all traces.
 * @param traces - Traces with ascending x
 * @returns The extent, or null when no trace has samples
 */
export function dataExtent(traces: Trace[]): Range | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of traces) {
    if (t.x.length === 0) continue;
    lo = Math.min(lo, t.x[0]);
    hi = Math.max(hi, t.x[t.x.length - 1]);
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
}

/**
 * Default x range of the plot. With a timebase it is the scope screen
 * (10 divisions centred on the trigger offset); if the record starts later than
 * the screen's left edge (records starting at t = 0, e.g. the mock scope) the
 * screen starts at the record start instead. Without a timebase it is the data extent.
 * @param traces - Traces to display
 * @param timebase - Scope horizontal frame, if known
 * @returns `[min, max]` in x units
 */
export function scopeFrame(traces: Trace[], timebase?: Timebase): Range {
  const extent = dataExtent(traces);
  if (!timebase || !(timebase.scaleSDiv > 0) || traces.some((t) => t.xUnit !== "s")) {
    if (!extent) return [0, 1];
    return extent[1] > extent[0] ? extent : [extent[0] - 0.5, extent[1] + 0.5];
  }
  const width = timebase.scaleSDiv * X_DIVISIONS;
  let left = timebase.offsetS - width / 2;
  if (extent && extent[0] > left + width * 0.01) left = extent[0];
  return [left, left + width];
}

/**
 * Value range of display-space y over a window, with padding, for "Achsen anpassen".
 * @param values - Display-space y arrays (already scaled)
 * @param pad - Relative padding (default 5 %)
 * @returns `[min, max]`, or null when there is no finite data
 */
export function yExtent(values: Float64Array[], pad = 0.05): Range | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const arr of values) {
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const span = hi - lo || Math.abs(hi) || 1;
  return [lo - span * pad, hi + span * pad];
}

/** True when two ranges agree within a relative tolerance. */
export function sameRange(a: Range, b: Range, tolerance = 1e-6): boolean {
  const span = Math.abs(b[1] - b[0]) || 1;
  return Math.abs(a[0] - b[0]) <= span * tolerance && Math.abs(a[1] - b[1]) <= span * tolerance;
}
