/**
 * One SI prefix per axis. Plotly's own SI tick formatting picks a prefix per
 * tick ("0s", "1ms", "10ms"); the plot instead scales the x data by the prefix
 * chosen from the axis range, so every tick and the hover time read the same
 * ("0 ms", "1 ms", "2,5 ms").
 */

export interface AxisScale {
  /** Divide base-unit values by this to get displayed values. */
  factor: number;
  /** SI prefix: "m", "µ", "k" … ("" for the base unit). */
  prefix: string;
  /** Base unit: "s" or "Hz". */
  unit: string;
  /** Text appended to tick labels and hover values, e.g. " ms". */
  suffix: string;
}

const PREFIXES: [number, string][] = [
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
  [1e-12, "p"],
];

/**
 * Chooses the SI prefix from the largest absolute value of the range, e.g.
 * `[-5e-6, 5e-6]` → µs, `[0, 0.01]` → ms, `[0, 50000]` Hz → kHz.
 * @param range - Axis range in base units
 * @param unit - "s" or "Hz"
 * @returns The scale; factor 1 for empty/non-finite ranges
 */
export function chooseAxisScale(
  range: [number, number],
  unit: string,
): AxisScale {
  const maxAbs = Math.max(Math.abs(range[0]), Math.abs(range[1]));
  const [factor, prefix] =
    (Number.isFinite(maxAbs) &&
      maxAbs > 0 &&
      PREFIXES.find(([f]) => maxAbs >= f * 0.9995)) ||
    PREFIXES[3];
  return { factor, prefix, unit, suffix: ` ${prefix}${unit}` };
}

/**
 * Formats one value with the axis' prefix, German decimal comma and U+2212 minus.
 * @param value - Value in base units
 * @param scale - Scale from {@link chooseAxisScale}
 * @param maxDecimals - Decimals kept after scaling (trailing zeros dropped)
 * @returns e.g. "0 ms", "2,5 ms", "−5 µs"
 */
export function formatAxisValue(
  value: number,
  scale: AxisScale,
  maxDecimals = 6,
): string {
  if (!Number.isFinite(value)) return "—";
  const text = (value / scale.factor).toLocaleString("de-DE", {
    maximumFractionDigits: maxDecimals,
    useGrouping: false,
  });
  return `${text.replace("-", "−")}${scale.suffix}`;
}
