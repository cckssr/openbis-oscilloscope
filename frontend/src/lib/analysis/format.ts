import { formatSI } from "../units";
import type { Measurement } from "./types";

/**
 * Formats a measurement for display with SI prefix and German decimal comma.
 * @param m - The measurement (or undefined)
 * @returns "1,41 V", "1 kHz", "45,0 °"; "—" when not computable
 */
export function formatMeasurement(m: Pick<Measurement, "value" | "unit"> | undefined): string {
  if (!m || !Number.isFinite(m.value)) return "—";
  if (m.unit === "°") {
    return `${m.value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °`;
  }
  return formatSI(m.value, m.unit);
}
