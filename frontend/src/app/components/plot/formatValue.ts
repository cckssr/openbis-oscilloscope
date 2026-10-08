import { formatSI } from "../../../lib/units";

/**
 * Formats a trace value with its unit; logarithmic dBV values get no SI prefix.
 * @param value - Value in base units
 * @param unit - "V", "A", "dBV", "s" or "Hz"
 * @returns e.g. "1,41 V", "−20,5 dBV"
 */
export function formatTraceValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "—";
  if (unit === "dBV") {
    return `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dBV`;
  }
  return formatSI(value, unit);
}
