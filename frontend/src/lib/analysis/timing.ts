/** Timing measurements: Frequenz, Periode, Anstiegszeit, Phase. */
import type { Trace } from "../trace";
import type { Analysis } from "./types";
import { findCrossings, percentiles, periodOf } from "./signal";

export const frequency: Analysis = {
  id: "frequency",
  label: "Frequenz",
  unit: "Hz",
  level: "basic",
  inputs: { traces: 1 },
  compute([t]) {
    const p = periodOf(t);
    return {
      values: [
        {
          id: "frequency",
          label: "Frequenz",
          value: p > 0 ? 1 / p : NaN,
          unit: "Hz",
          traceId: t.id,
        },
      ],
    };
  },
};

export const period: Analysis = {
  id: "period",
  label: "Periode",
  unit: "s",
  level: "basic",
  inputs: { traces: 1 },
  compute([t]) {
    return {
      values: [
        {
          id: "period",
          label: "Periode",
          value: periodOf(t),
          unit: "s",
          traceId: t.id,
        },
      ],
    };
  },
};

/**
 * 10–90 % rise time of the rising edges (median over all complete edges).
 * Base and top levels are the 2nd and 98th percentile, so overshoot and
 * single spikes do not distort the thresholds.
 * @param t - A time-domain trace
 * @returns Rise time in seconds, NaN when no complete rising edge exists
 */
export function riseTime(t: Trace): number {
  const [base, top] = percentiles(t.y, [0.02, 0.98]);
  const swing = top - base;
  if (!(swing > 0)) return NaN;
  const lo = base + 0.1 * swing;
  const hi = base + 0.9 * swing;
  const { x, y } = t;
  const times: number[] = [];
  let t10: number | null = null;
  for (let i = 1; i < y.length; i++) {
    const a = y[i - 1];
    const b = y[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (b < lo) {
      t10 = null;
      continue;
    }
    if (a < lo && b >= lo) {
      t10 = x[i - 1] + ((lo - a) / (b - a)) * (x[i] - x[i - 1]);
    }
    if (t10 !== null && a < hi && b >= hi) {
      const t90 = x[i - 1] + ((hi - a) / (b - a)) * (x[i] - x[i - 1]);
      times.push(t90 - t10);
      t10 = null;
    }
  }
  if (times.length === 0) return NaN;
  times.sort((p, q) => p - q);
  return times[times.length >> 1];
}

export const riseTimeAnalysis: Analysis = {
  id: "rise-time",
  label: "Anstiegszeit",
  unit: "s",
  level: "expert",
  inputs: { traces: 1 },
  compute([t]) {
    return {
      values: [
        {
          id: "rise-time",
          label: "Anstiegszeit (10–90 %)",
          value: riseTime(t),
          unit: "s",
          traceId: t.id,
        },
      ],
    };
  },
};

/**
 * Phase of `other` relative to `ref` in degrees, wrapped to (−180, 180].
 * Sign convention: **positive = `other` lags `ref`** (its rising mid-level
 * crossings come later). For every rising crossing of `ref` the nearest
 * crossing of `other` is taken; the per-edge delays are averaged on the
 * circle, so a phase near ±180° does not flip between frames.
 * @param ref - Reference trace
 * @param other - Trace compared against the reference
 * @returns Phase in degrees, NaN when either signal is not periodic
 */
export function phaseDegrees(ref: Trace, other: Trace): number {
  const T = periodOf(ref);
  if (!(T > 0) || !(periodOf(other) > 0)) return NaN;
  const a = findCrossings(ref).rising;
  const b = findCrossings(other).rising;
  if (a.length === 0 || b.length === 0) return NaN;
  let sin = 0;
  let cos = 0;
  let j = 0;
  for (const tr of a) {
    while (j < b.length - 1 && b[j + 1] < tr) j++;
    const candidates = [b[j], b[Math.min(j + 1, b.length - 1)]];
    let best = candidates[0] - tr;
    for (const c of candidates)
      if (Math.abs(c - tr) < Math.abs(best)) best = c - tr;
    const angle = (2 * Math.PI * best) / T;
    sin += Math.sin(angle);
    cos += Math.cos(angle);
  }
  const deg = (Math.atan2(sin, cos) * 180) / Math.PI;
  return deg <= -180 ? 180 : deg;
}

export const phase: Analysis = {
  id: "phase",
  label: "Phase",
  unit: "°",
  level: "expert",
  inputs: { traces: 2 },
  compute([ref, other]) {
    return {
      values: [
        {
          id: "phase",
          label: "Phase",
          value: phaseDegrees(ref, other),
          unit: "°",
          traceId: other.id,
          refTraceId: ref.id,
        },
      ],
    };
  },
};
