import { lowerBound } from "../../../lib/decimate";
import type { Trace } from "../../../lib/trace";

/**
 * Linearly interpolated trace value at x.
 * @param trace - Trace with ascending x
 * @param x - Position (e.g. seconds)
 * @returns The value, or NaN outside the trace's x range
 */
export function valueAt(trace: Trace, x: number): number {
  const n = trace.x.length;
  if (n === 0 || x < trace.x[0] || x > trace.x[n - 1]) return NaN;
  const i = lowerBound(trace.x, x);
  if (i === 0) return trace.y[0];
  const x0 = trace.x[i - 1];
  const x1 = trace.x[i];
  const f = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
  return trace.y[i - 1] + f * (trace.y[i] - trace.y[i - 1]);
}
