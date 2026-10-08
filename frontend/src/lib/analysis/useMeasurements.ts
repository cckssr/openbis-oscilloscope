import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Trace } from "../trace";
import { computeMeasurements } from "./compute";
import type { AnalysisRequest, AnalysisResponse } from "./protocol";
import { packTrace } from "./protocol";
import type { Measurement } from "./types";

export interface UseMeasurementsOptions {
  /** Reference trace id for two-trace analyses (phase); first trace by default. */
  referenceTraceId?: string;
  /** Wait this long after the last data change before computing (default 200 ms). */
  debounceMs?: number;
}

export interface UseMeasurementsResult {
  measurements: Measurement[];
  /** True while a computation for the current data is outstanding. */
  computing: boolean;
  /** Finds one value; undefined while not yet computed. */
  get(traceId: string, analysisId: string): Measurement | undefined;
}

/** Same traces == same ids and same sample arrays (frames create new arrays). */
function sameTraces(a: Trace[], b: Trace[]): boolean {
  return a.length === b.length && a.every((t, i) => t.id === b[i].id && t.y === b[i].y && t.x === b[i].x);
}

function createWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

/**
 * Computes measurements for the given traces in a Web Worker. Debounced; results of
 * outdated requests are ignored, so quickly changing live frames never show stale
 * numbers. Falls back to the main thread where workers are unavailable (jsdom tests).
 * @param traces - Traces to measure (full resolution)
 * @param selectedIds - Analysis ids to compute (see the analysis registry)
 * @param options - Reference trace and debounce time
 * @returns The latest measurements, a `computing` flag and a lookup helper
 */
export function useMeasurements(
  traces: Trace[],
  selectedIds: string[],
  options: UseMeasurementsOptions = {},
): UseMeasurementsResult {
  const { referenceTraceId, debounceMs = 200 } = options;
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [computing, setComputing] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const latestRequest = useRef(0);

  // Keep a stable identity while only the array wrapper changes.
  const stableTraces = useStableTraces(traces);
  const idsKey = selectedIds.join("|");

  useEffect(() => {
    const requestId = ++latestRequest.current;
    const analysisIds = idsKey ? idsKey.split("|") : [];
    if (stableTraces.length === 0 || analysisIds.length === 0) {
      const timer = setTimeout(() => {
        if (latestRequest.current !== requestId) return;
        setMeasurements([]);
        setComputing(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      if (latestRequest.current !== requestId) return;
      setComputing(true);
      if (!workerRef.current) workerRef.current = createWorker();
      const worker = workerRef.current;
      if (!worker) {
        // No worker support: compute here, still ignoring stale results.
        const result = computeMeasurements(stableTraces, analysisIds, referenceTraceId);
        if (latestRequest.current === requestId) {
          setMeasurements(result);
          setComputing(false);
        }
        return;
      }
      worker.onmessage = (e: MessageEvent<AnalysisResponse>) => {
        if (e.data.requestId !== latestRequest.current) return; // stale
        if ("error" in e.data) setMeasurements([]);
        else setMeasurements(e.data.measurements);
        setComputing(false);
      };
      worker.onerror = () => {
        if (latestRequest.current === requestId) setComputing(false);
      };
      const request: AnalysisRequest = {
        requestId,
        traces: stableTraces.map(packTrace),
        analysisIds,
        referenceTraceId,
      };
      worker.postMessage(request);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [stableTraces, idsKey, referenceTraceId, debounceMs]);

  useEffect(
    () => () => {
      latestRequest.current++;
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  const index = useMemo(() => new Map(measurements.map((m) => [`${m.traceId}|${m.id}`, m])), [measurements]);
  const get = useCallback((traceId: string, id: string) => index.get(`${traceId}|${id}`), [index]);
  return { measurements, computing, get };
}

/** Returns the previous array while the new one holds the same sample data. */
function useStableTraces(traces: Trace[]): Trace[] {
  const [stable, setStable] = useState(traces);
  if (stable !== traces && !sameTraces(stable, traces)) setStable(traces);
  return stable;
}
