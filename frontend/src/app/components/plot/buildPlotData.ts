/** Builds the Plotly trace objects: decimation per visible window, display transform, hover text. */
import type { Data } from "plotly.js";
import { decimateMinMax, type Decimated } from "../../../lib/decimate";
import type { Trace } from "../../../lib/trace";
import { toDisplayArray, type YMode } from "./displayTransform";
import type { Range } from "./plotGeometry";

/** Above this many source samples per trace the WebGL renderer is used. */
export const GL_THRESHOLD = 100_000;

interface CacheEntry {
  key: string;
  value: Decimated;
}
const decimationCache = new WeakMap<Float64Array, CacheEntry>();

/**
 * Min/max-decimates a trace to the visible window; memoised per sample array,
 * so re-renders without new data (hover, cursor drags) cost nothing.
 * @param trace - Source trace
 * @param window - Visible x range (padded by the caller)
 * @param maxPoints - Point budget (≈ 2 × plot width)
 * @returns Decimated x/y
 */
export function decimateCached(trace: Trace, window: Range, maxPoints: number): Decimated {
  const key = `${trace.x.length}|${window[0]}|${window[1]}|${maxPoints}|${trace.x[0]}`;
  const hit = decimationCache.get(trace.y);
  if (hit && hit.key === key) return hit.value;
  const value = decimateMinMax(trace.x, trace.y, maxPoints, window[0], window[1]);
  decimationCache.set(trace.y, { key, value });
  return value;
}

/** Point budget for a plot of the given pixel width. */
export function pointBudget(plotWidthPx: number): number {
  return Math.min(8000, Math.max(600, Math.round(plotWidthPx * 2)));
}

function hoverTemplate(trace: Trace, mode: YMode): string {
  const name = `<b>${trace.label}</b>`;
  const unit = trace.yUnit === "dBV" ? " dBV" : trace.yUnit;
  if (trace.yUnit === "dBV") return `${name} %{y:.1f}${unit}<extra></extra>`;
  const value = mode === "divisions" ? "%{customdata:.4~s}" : "%{y:.4~s}";
  return `${name} ${value}${unit}<extra></extra>`;
}

/** Divides x by the axis prefix factor (new array; the decimated view is cached). */
function scaleX(x: Float64Array, factor: number): Float64Array {
  if (factor === 1) return x;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] / factor;
  return out;
}

/**
 * Creates the Plotly data for all traces.
 * @param traces - Traces to draw
 * @param opts - y mode, visible x window (base units), plot width in px and the x axis prefix factor
 * @returns One `scatter`/`scattergl` object per trace
 */
export function buildPlotData(
  traces: Trace[],
  opts: { mode: YMode; window: Range; plotWidth: number; xFactor?: number },
): Data[] {
  const { mode, window, plotWidth, xFactor = 1 } = opts;
  const pad = (window[1] - window[0]) * 0.2;
  const padded: Range = [window[0] - pad, window[1] + pad];
  const budget = pointBudget(plotWidth);
  return traces.map((trace) => {
    const dec = decimateCached(trace, padded, budget);
    const gl = trace.x.length > GL_THRESHOLD;
    return {
      type: gl ? "scattergl" : "scatter",
      mode: "lines",
      name: trace.label,
      x: scaleX(dec.x, xFactor),
      y: toDisplayArray(trace, mode, dec.y),
      customdata: mode === "divisions" ? dec.y : undefined,
      line: { color: trace.color, width: 1.6 },
      hovertemplate: hoverTemplate(trace, mode),
      showlegend: false,
    } as unknown as Data;
  });
}
