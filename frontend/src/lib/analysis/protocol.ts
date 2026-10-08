/**
 * Message format between `useMeasurements` and `analysis.worker.ts`. Uniformly
 * sampled time axes are sent as `(x0, dt)` instead of an array, which halves
 * the data copied for deep-memory captures.
 */
import type { Trace } from "../trace";
import type { Measurement } from "./types";

export interface PackedTrace {
  id: string;
  kind: Trace["kind"];
  label: string;
  color: string;
  xUnit: Trace["xUnit"];
  yUnit: Trace["yUnit"];
  y: Float64Array;
  /** Present for non-uniform axes. */
  x?: Float64Array;
  /** Uniform axis: x[i] = x0 + i * dt. */
  x0?: number;
  dt?: number;
}

export interface AnalysisRequest {
  requestId: number;
  traces: PackedTrace[];
  analysisIds: string[];
  referenceTraceId?: string;
}

export type AnalysisResponse =
  | { requestId: number; measurements: Measurement[] }
  | { requestId: number; error: string };

/** True when x[i] == x0 + i*dt within float noise (checked at 3 points). */
function isUniform(x: Float64Array): boolean {
  const n = x.length;
  if (n < 3) return false;
  const dt = (x[n - 1] - x[0]) / (n - 1);
  if (!(dt > 0)) return false;
  return [Math.floor(n / 3), Math.floor(n / 2), n - 2].every(
    (i) => Math.abs(x[i] - (x[0] + i * dt)) <= dt * 1e-6 * Math.max(1, i / 1e3),
  );
}

/**
 * Prepares a trace for transfer to the worker.
 * @param t - A trace
 * @returns Structured-cloneable form with `x` replaced by `(x0, dt)` when uniform
 */
export function packTrace(t: Trace): PackedTrace {
  const base = {
    id: t.id,
    kind: t.kind,
    label: t.label,
    color: t.color,
    xUnit: t.xUnit,
    yUnit: t.yUnit,
    y: t.y,
  };
  if (isUniform(t.x)) {
    return {
      ...base,
      x0: t.x[0],
      dt: (t.x[t.x.length - 1] - t.x[0]) / (t.x.length - 1),
    };
  }
  return { ...base, x: t.x };
}

/**
 * Restores a trace inside the worker.
 * @param p - A packed trace
 * @returns The full trace
 */
export function unpackTrace(p: PackedTrace): Trace {
  let x = p.x;
  if (!x) {
    x = new Float64Array(p.y.length);
    const x0 = p.x0 ?? 0;
    const dt = p.dt ?? 1;
    for (let i = 0; i < x.length; i++) x[i] = x0 + i * dt;
  }
  return {
    id: p.id,
    kind: p.kind,
    label: p.label,
    color: p.color,
    xUnit: p.xUnit,
    yUnit: p.yUnit,
    x,
    y: p.y,
  };
}
