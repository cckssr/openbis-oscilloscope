/**
 * Runs registered analyses over traces. Used by the Web Worker, by the
 * main-thread fallback and by tests.
 */
import type { Trace } from "../trace";
import { getAnalysis } from "./registry";
import "./builtins";
import type { Measurement } from "./types";

/** Only time-domain voltage/current traces are measurable. */
export function isMeasurable(trace: Trace): boolean {
  return trace.kind !== "analysis" && trace.xUnit === "s" && trace.y.length > 1;
}

/**
 * Computes the requested measurements for every measurable trace.
 * One-trace analyses run per trace; two-trace analyses (phase) run for every
 * trace other than the reference.
 * @param traces - Input traces (full resolution)
 * @param analysisIds - Ids of the analyses to run, e.g. ["vpp", "frequency"]
 * @param referenceTraceId - Reference for two-trace analyses; first measurable trace by default
 * @returns One measurement per (analysis, trace); NaN values mean "not computable"
 */
export function computeMeasurements(
  traces: Trace[],
  analysisIds: string[],
  referenceTraceId?: string,
): Measurement[] {
  const measurable = traces.filter(isMeasurable);
  const out: Measurement[] = [];
  for (const id of analysisIds) {
    const analysis = getAnalysis(id);
    if (!analysis) continue;
    if (analysis.inputs.traces === 1) {
      for (const t of measurable)
        out.push(...safeCompute(analysis.compute, [t], id, t.id));
    } else {
      const ref =
        measurable.find((t) => t.id === referenceTraceId) ?? measurable[0];
      if (!ref) continue;
      for (const t of measurable) {
        if (t === ref) continue;
        out.push(...safeCompute(analysis.compute, [ref, t], id, t.id));
      }
    }
  }
  return out;
}

function safeCompute(
  compute: (traces: Trace[]) => { values?: Measurement[] },
  input: Trace[],
  id: string,
  traceId: string,
): Measurement[] {
  try {
    return compute(input).values ?? [];
  } catch {
    const analysis = getAnalysis(id);
    return [
      {
        id,
        label: analysis?.label ?? id,
        value: NaN,
        unit: analysis?.unit ?? "",
        traceId,
      },
    ];
  }
}
