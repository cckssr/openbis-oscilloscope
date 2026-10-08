/**
 * Web Worker running measurements off the main thread so deep-memory
 * captures (millions of samples) never freeze the UI. Protocol: see protocol.ts.
 */
import { computeMeasurements } from "./compute";
import type { AnalysisRequest, AnalysisResponse } from "./protocol";
import { unpackTrace } from "./protocol";

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage(message: AnalysisResponse): void;
};

ctx.onmessage = (e) => {
  const { requestId, traces, analysisIds, referenceTraceId } = e.data;
  try {
    const measurements = computeMeasurements(
      traces.map(unpackTrace),
      analysisIds,
      referenceTraceId,
    );
    ctx.postMessage({ requestId, measurements });
  } catch (err) {
    ctx.postMessage({
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
