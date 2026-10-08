/**
 * Contracts of the analysis registry (review §6.5). An {@link Analysis} turns
 * one or two traces into measurements, derived traces or overlays; the
 * measurement table, the upload metadata and future FFT/math views all use it.
 */
import type { Overlay, Trace } from "../trace";

/** One computed value, e.g. the peak-to-peak voltage of CH1. */
export interface Measurement {
  /** Id of the analysis that produced it ("vpp", "frequency", …). */
  id: string;
  /** Short German label for table headers ("Vpp"). */
  label: string;
  /** Value in base units; NaN when it cannot be computed (noise, no period, …). */
  value: number;
  /** Base unit: "V", "A", "dBV", "Hz", "s" or "°". */
  unit: string;
  /** Trace the value belongs to. For two-trace analyses this is the second trace. */
  traceId: string;
  /** Reference trace of two-trace analyses (phase). */
  refTraceId?: string;
}

/** Result of {@link Analysis.compute}. */
export interface AnalysisResult {
  values?: Measurement[];
  /** Derived traces (FFT, math), drawn like any other trace. */
  traces?: Trace[];
  /** Markers such as crossing points. */
  overlays?: Overlay[];
}

export interface Analysis {
  id: string;
  /** Short German label, e.g. "Effektivwert". */
  label: string;
  /** Unit of the produced values; "" when it follows the trace (V/A/dBV). */
  unit: string;
  /** Shown to every user ("basic") or only in the expert view ("expert"). */
  level: "basic" | "expert";
  /**
   * What `compute` returns: "values" (default) fill the measurement table, "traces" produce
   * derived traces (FFT) and are not offered as table columns.
   */
  output?: "values" | "traces";
  /** How many traces `compute` expects: 1 per trace, 2 as (reference, other). */
  inputs: { traces: 1 | 2 };
  /** Pure function: must not mutate the traces, runs inside a Web Worker. */
  compute(traces: Trace[]): AnalysisResult;
}
