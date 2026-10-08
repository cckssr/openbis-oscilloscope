/**
 * Min/max (peak-detect) decimation for plotting deep-memory captures.
 * Every pixel bucket keeps its minimum and maximum sample, so single-sample
 * spikes and glitches survive, unlike "take every n-th sample".
 */

/** A decimated copy (or view) of a time series with ascending x. */
export interface Decimated {
  x: Float64Array;
  y: Float64Array;
}

/**
 * First index whose x is >= value in an ascending array.
 * @param x - Ascending sample positions
 * @param value - The position to look for
 * @returns Index in [0, x.length]
 */
export function lowerBound(x: ArrayLike<number>, value: number): number {
  let lo = 0;
  let hi = x.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (x[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Reduces a series to at most about `maxPoints` points while keeping every
 * bucket's minimum and maximum. Output x stays ascending (points inside a
 * bucket are emitted in their original order). Only samples inside
 * `[xMin, xMax]` (plus one neighbour on each side, so lines reach the edge)
 * are considered, which lets the caller re-decimate when the user zooms.
 * When the window holds fewer than `maxPoints` samples, the result is a
 * zero-copy view of the input.
 * @param x - Ascending sample positions
 * @param y - Sample values, same length as `x`
 * @param maxPoints - Output budget (typically 2 × plot width in pixels)
 * @param xMin - Window start (default: whole series)
 * @param xMax - Window end (default: whole series)
 * @returns Decimated arrays
 */
export function decimateMinMax(
  x: Float64Array,
  y: Float64Array,
  maxPoints: number,
  xMin = -Infinity,
  xMax = Infinity,
): Decimated {
  const total = Math.min(x.length, y.length);
  if (total === 0) return { x: x.subarray(0, 0), y: y.subarray(0, 0) };
  const i0 = Math.max(0, lowerBound(x, xMin) - 1);
  const i1 = Math.min(total, lowerBound(x, xMax) + 1);
  const n = i1 - i0;
  const buckets = Math.floor(maxPoints / 2);
  if (n <= maxPoints || buckets < 1) {
    return { x: x.subarray(i0, i1), y: y.subarray(i0, i1) };
  }

  const outX = new Float64Array(buckets * 2);
  const outY = new Float64Array(buckets * 2);
  let count = 0;
  for (let b = 0; b < buckets; b++) {
    const start = i0 + Math.floor((b * n) / buckets);
    const end = i0 + Math.floor(((b + 1) * n) / buckets);
    let minI = -1;
    let maxI = -1;
    let minV = Infinity;
    let maxV = -Infinity;
    for (let i = start; i < end; i++) {
      const v = y[i];
      if (v < minV) {
        minV = v;
        minI = i;
      }
      if (v > maxV) {
        maxV = v;
        maxI = i;
      }
    }
    if (minI < 0) {
      // Only NaN in this bucket: keep one point so the gap stays visible.
      outX[count] = x[start];
      outY[count++] = NaN;
      continue;
    }
    const first = Math.min(minI, maxI);
    const second = Math.max(minI, maxI);
    outX[count] = x[first];
    outY[count++] = y[first];
    if (second !== first) {
      outX[count] = x[second];
      outY[count++] = y[second];
    }
  }
  return { x: outX.subarray(0, count), y: outY.subarray(0, count) };
}
