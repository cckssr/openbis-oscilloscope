/**
 * Geometry shared by the plot, the cursor overlay and the readouts: fixed
 * plot margins (so overlays can map data to pixels without Plotly internals),
 * the scope-screen frame and data extents.
 */
import type { Timebase, Trace } from "../../../lib/trace";
import { SEC_PER_DIV_STEPS } from "../../../lib/units";

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
 * screen starts at the record start instead. Without a timebase (archive
 * captures) the s/div is inferred from the record length and snapped to the
 * 1-2-5 sequence, so the grid lands on round divisions; records that don't
 * match a scope screen fall back to the data extent.
 * @param traces - Traces to display
 * @param timebase - Scope horizontal frame, if known
 * @returns `[min, max]` in x units
 */
export function scopeFrame(traces: Trace[], timebase?: Timebase): Range {
  const extent = dataExtent(traces);
  const timeDomain = traces.every((t) => t.xUnit === "s");
  if (!timebase || !(timebase.scaleSDiv > 0) || !timeDomain) {
    if (!extent) return [0, 1];
    if (extent[1] <= extent[0]) return [extent[0] - 0.5, extent[1] + 0.5];
    const inferred = timeDomain ? inferScreenFrame(extent) : null;
    return inferred ?? extent;
  }
  const width = timebase.scaleSDiv * X_DIVISIONS;
  let left = timebase.offsetS - width / 2;
  if (extent && extent[0] > left + width * 0.01) left = extent[0];
  return [left, left + width];
}

/**
 * Snaps a record's span to a scope screen of 10 divisions with a 1-2-5 s/div.
 * A record of N samples spans (N−1)·dt, slightly less than the screen, so the
 * snapped s/div is accepted when it is within ±10 % of span/10.
 * @param extent - Data extent in seconds
 * @returns The screen frame starting at the record start, or null when no step fits
 */
export function inferScreenFrame(extent: Range): Range | null {
  const raw = (extent[1] - extent[0]) / X_DIVISIONS;
  let best = SEC_PER_DIV_STEPS[0];
  for (const v of SEC_PER_DIV_STEPS) {
    if (Math.abs(Math.log(v / raw)) < Math.abs(Math.log(best / raw))) best = v;
  }
  if (Math.abs(best / raw - 1) > 0.1) return null;
  return [extent[0], extent[0] + best * X_DIVISIONS];
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
