import { safeFilename } from "../download";
import type { Trace } from "../trace";
import type { ExportInput, Exporter } from "./types";

/** Column header of a trace's value column: "CH1_V", "FFT(CH1)_dBV". */
export function valueColumnName(t: Trace): string {
  return `${safeFilename(t.id)}_${t.yUnit}`;
}

/** Linear interpolation of a trace at positions `xs` (xs ascending). */
function resample(t: Trace, xs: Float64Array): Float64Array {
  const out = new Float64Array(xs.length);
  let j = 0;
  for (let i = 0; i < xs.length; i++) {
    while (j < t.x.length - 2 && t.x[j + 1] < xs[i]) j++;
    const x0 = t.x[j];
    const x1 = t.x[j + 1];
    const f = x1 === x0 ? 0 : (xs[i] - x0) / (x1 - x0);
    out[i] = xs[i] < x0 || xs[i] > x1 ? NaN : t.y[j] + f * (t.y[j + 1] - t.y[j]);
  }
  return out;
}

/**
 * Splits traces into a shared x axis and one value array per trace. Traces
 * sampled on the same axis are used as is; others are interpolated onto the
 * longest trace's axis (NaN outside their range).
 * @param traces - Traces to tabulate (same x unit)
 * @returns Shared axis and columns
 */
export function alignTraces(traces: Trace[]): { x: Float64Array; columns: Float64Array[] } {
  const ref = traces.reduce((a, b) => (b.x.length > a.x.length ? b : a));
  const same = (t: Trace) =>
    t.x === ref.x ||
    (t.x.length === ref.x.length &&
      t.x[0] === ref.x[0] &&
      t.x[t.x.length - 1] === ref.x[ref.x.length - 1] &&
      t.x[t.x.length >> 1] === ref.x[ref.x.length >> 1]);
  return { x: ref.x, columns: traces.map((t) => (same(t) ? t.y : resample(t, ref.x))) };
}

/**
 * Builds the CSV text parts: header `time_s,CH1_V,CH2_V`, then one row per
 * sample at full resolution. Numbers use a decimal point and full precision so
 * the file is machine-readable (Python, Origin, Excel with English locale).
 * @param traces - Traces with the same x unit
 * @returns Chunks to feed into a Blob
 */
export function csvParts(traces: Trace[]): string[] {
  const { x, columns } = alignTraces(traces);
  const xName = traces[0].xUnit === "Hz" ? "freq_Hz" : "time_s";
  const parts = [`${[xName, ...traces.map(valueColumnName)].join(",")}\n`];
  const chunk = 5000;
  for (let start = 0; start < x.length; start += chunk) {
    const end = Math.min(x.length, start + chunk);
    const lines: string[] = [];
    for (let i = start; i < end; i++) {
      let line = String(x[i]);
      for (const c of columns) line += `,${Number.isNaN(c[i]) ? "" : c[i]}`;
      lines.push(line);
    }
    parts.push(`${lines.join("\n")}\n`);
  }
  return parts;
}

export const csvExporter: Exporter = {
  id: "csv",
  label: "CSV (Tabelle)",
  ext: "csv",
  appliesTo: "capture",
  isAvailable: (input: ExportInput) => !!input.traces?.length,
  async run(input) {
    return new Blob(csvParts(input.traces ?? []), { type: "text/csv;charset=utf-8" });
  },
};
