/**
 * Numerical helpers shared by the measurements: extrema, robust percentiles,
 * hysteresis crossing detection, whole-period windows. All functions are pure
 * and tolerate NaN samples and short records.
 */
import { lowerBound } from "../decimate";
import type { Trace } from "../trace";

export interface Extrema {
  min: number;
  max: number;
  mean: number;
  count: number;
}

/**
 * Scans all finite samples once.
 * @param y - Sample values
 * @param from - First index (inclusive)
 * @param to - Last index (exclusive)
 * @returns min, max and mean of the finite samples; count 0 when there are none
 */
export function extrema(y: Float64Array, from = 0, to = y.length): Extrema {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (let i = from; i < to; i++) {
    const v = y[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    count++;
  }
  return { min, max, mean: count ? sum / count : NaN, count };
}

/**
 * Percentile of a (strided sub-)sample, robust against single outliers.
 * @param y - Sample values
 * @param fractions - Percentiles in [0, 1], ascending is not required
 * @returns One value per requested fraction (NaN when the series is empty)
 */
export function percentiles(y: Float64Array, fractions: number[]): number[] {
  const stride = Math.max(1, Math.floor(y.length / 20_000));
  const sample: number[] = [];
  for (let i = 0; i < y.length; i += stride) {
    if (Number.isFinite(y[i])) sample.push(y[i]);
  }
  if (sample.length === 0) return fractions.map(() => NaN);
  sample.sort((a, b) => a - b);
  return fractions.map(
    (f) =>
      sample[
        Math.min(
          sample.length - 1,
          Math.max(0, Math.round(f * (sample.length - 1))),
        )
      ],
  );
}

/** Median of a non-empty list. */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface Crossings {
  rising: number[];
  falling: number[];
  /** Mid level (50 % between min and max) the crossings refer to. */
  level: number;
}

const crossingCache = new WeakMap<Float64Array, Crossings>();

/**
 * Finds rising and falling crossings of the 50 % level using a Schmitt
 * trigger (hysteresis of 10 % of the swing around the level), so noise on a
 * slow edge does not create spurious crossings. The reported time is
 * linearly interpolated at the mid level itself.
 * @param trace - A time-domain trace
 * @returns Crossing times in seconds (cached per trace data)
 */
export function findCrossings(trace: Trace): Crossings {
  const cached = crossingCache.get(trace.y);
  if (cached) return cached;
  const { x, y } = trace;
  const { min, max } = extrema(y);
  const result: Crossings = { rising: [], falling: [], level: (min + max) / 2 };
  const swing = max - min;
  if (!(swing > 0) || y.length < 3) {
    crossingCache.set(trace.y, result);
    return result;
  }
  const level = result.level;
  const hyst = swing * 0.1;
  let state: "high" | "low" | null = null;

  for (let i = 0; i < y.length; i++) {
    const v = y[i];
    if (!Number.isFinite(v)) continue;
    const next = v > level + hyst ? "high" : v < level - hyst ? "low" : null;
    if (next === null) continue;
    if (state !== null && next !== state) {
      // Walk back to the last sample on the old side of the level.
      let k = i - 1;
      if (next === "high") while (k > 0 && y[k] > level) k--;
      else while (k > 0 && y[k] < level) k--;
      const y0 = y[k];
      const y1 = y[k + 1];
      const frac = y1 === y0 ? 0 : (level - y0) / (y1 - y0);
      const t = x[k] + (x[k + 1] - x[k]) * Math.min(1, Math.max(0, frac));
      (next === "high" ? result.rising : result.falling).push(t);
    }
    state = next;
  }
  crossingCache.set(trace.y, result);
  return result;
}

/**
 * Estimates the period from consecutive crossings of the same direction.
 * Rejects records whose intervals disagree (noise, aperiodic signals).
 * @param trace - A time-domain trace
 * @returns Period in seconds, or NaN when the signal is not periodic
 */
export function periodOf(trace: Trace): number {
  const { rising, falling } = findCrossings(trace);
  const intervals: number[] = [];
  for (const list of [rising, falling]) {
    for (let i = 1; i < list.length; i++) intervals.push(list[i] - list[i - 1]);
  }
  if (intervals.length === 0) return NaN;
  const period = median(intervals);
  if (!(period > 0)) return NaN;
  if (intervals.length >= 3) {
    const deviations = intervals.map((v) => Math.abs(v - period));
    if (median(deviations) / period > 0.1) return NaN;
  }
  return period;
}

/**
 * Index window covering a whole number of periods (first rising crossing to
 * the last one), so mean and RMS do not depend on where the record is cut.
 * @param trace - A time-domain trace
 * @returns `[from, to)` sample indices; the full record when no full period exists
 */
export function wholePeriodWindow(trace: Trace): [number, number] {
  const { rising } = findCrossings(trace);
  if (rising.length < 2) return [0, trace.y.length];
  const lo = rising[0];
  const hi = rising[rising.length - 1];
  const from = lowerBound(trace.x, lo);
  const to = lowerBound(trace.x, hi);
  return to - from >= 2 ? [from, to] : [0, trace.y.length];
}
