/**
 * SI formatting/parsing and 1-2-5 scale sequences, shared by every control,
 * readout and export. All user-visible numbers use German formatting
 * (decimal comma).
 */

const SI_PREFIXES: [number, string][] = [
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
  [1e-12, "p"],
];

/** Accepted input suffixes; `u` is an ASCII alias for `µ`. */
const SUFFIX_FACTORS: Record<string, number> = {
  G: 1e9,
  M: 1e6,
  k: 1e3,
  K: 1e3,
  m: 1e-3,
  µ: 1e-6,
  μ: 1e-6,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
};

/**
 * Rounds to a number of significant digits and strips float noise
 * (e.g. `0.30000000000000004` → `0.3`).
 * @param value - The number to round
 * @param digits - Significant digits (default 3)
 * @returns The rounded number
 */
export function roundSig(value: number, digits = 3): number {
  if (!Number.isFinite(value) || value === 0) return value;
  return Number(value.toPrecision(digits));
}

/**
 * Rounds a value to the precision implied by a step (e.g. step 0.01 → 2 decimals).
 * @param value - The number to round
 * @param step - The step whose decimal places define the precision
 * @returns The rounded number
 */
export function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || step <= 0) return value;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(value.toFixed(Math.min(decimals, 15)));
}

/** Formats a plain number with a German decimal comma, trimming trailing zeros. */
function formatNumberDe(value: number, digits: number): string {
  const rounded = roundSig(value, digits);
  return rounded.toLocaleString("de-DE", {
    maximumSignificantDigits: digits,
    useGrouping: false,
  });
}

/**
 * Formats a value with an SI prefix: `formatSI(0.0002, "V")` → `"200 mV"`.
 * @param value - The value in base units
 * @param unit - The base unit (e.g. "V", "s", "Hz", "Sa/s"); empty for none
 * @param digits - Significant digits (default 3)
 * @returns The formatted string, or "—" for non-finite input
 */
export function formatSI(value: number, unit = "", digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return `0 ${unit}`.trim();
  const abs = Math.abs(roundSig(value, digits));
  const [factor, prefix] =
    SI_PREFIXES.find(([f]) => abs >= f * 0.9995) ??
    SI_PREFIXES[SI_PREFIXES.length - 1];
  return `${formatNumberDe(value / factor, digits)} ${prefix}${unit}`.trim();
}

/**
 * Formats a scale setting per division: `formatPerDiv(1e-6, "s")` → `"1 µs/div"`.
 * @param value - The scale in base units per division
 * @param unit - The base unit ("V" or "s")
 * @returns The formatted string
 */
export function formatPerDiv(value: number, unit: string): string {
  return `${formatSI(value, unit)}/div`;
}

/**
 * Parses user input with optional SI suffix and either decimal separator:
 * `"-0,5"`, `"200m"`, `"5 µ"`, `"1.5k"`, `"200 mV"` (unit suffix ignored).
 * @param input - The raw text typed by the user
 * @param unit - Optional unit to strip from the end (e.g. "V", "s/div")
 * @returns The parsed number, or null when the text is not a number
 */
export function parseSI(input: string, unit = ""): number | null {
  let text = input.trim().replace(/\s+/g, "");
  if (unit) {
    const u = unit.replace(/\s+/g, "");
    if (text.toLowerCase().endsWith(u.toLowerCase())) {
      text = text.slice(0, -u.length);
    }
  }
  text = text.replace(",", ".");
  const match = text.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-zA-Zµμ]?)$/);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  if (!match[2]) return base;
  const factor = SUFFIX_FACTORS[match[2]];
  return factor === undefined ? null : roundSig(base * factor, 12);
}

/**
 * Builds the 1-2-5 sequence between two bounds (inclusive), like a scope knob.
 * @param min - Smallest value (e.g. 1e-3 for 1 mV/div)
 * @param max - Largest value (e.g. 10 for 10 V/div)
 * @returns Ascending list such as [0.001, 0.002, 0.005, 0.01, …]
 */
export function sequence125(min: number, max: number): number[] {
  const values: number[] = [];
  let decade = Math.pow(10, Math.floor(Math.log10(min)));
  while (decade <= max * 1.0001) {
    for (const m of [1, 2, 5]) {
      const v = roundSig(m * decade, 6);
      if (v >= min * 0.9999 && v <= max * 1.0001) values.push(v);
    }
    decade *= 10;
  }
  return values;
}

/**
 * Steps to the neighbouring value of an ascending sequence. Values between
 * two entries snap to the next one in the step direction.
 * @param sequence - Ascending allowed values (e.g. from {@link sequence125})
 * @param value - Current value
 * @param direction - +1 for the next larger value, -1 for the next smaller
 * @returns The neighbouring value, clamped to the sequence ends
 */
export function stepInSequence(
  sequence: number[],
  value: number,
  direction: 1 | -1,
): number {
  if (sequence.length === 0) return value;
  const eps = Math.abs(value) * 1e-6;
  if (direction > 0) {
    return sequence.find((v) => v > value + eps) ?? sequence[sequence.length - 1];
  }
  for (let i = sequence.length - 1; i >= 0; i--) {
    if (sequence[i] < value - eps) return sequence[i];
  }
  return sequence[0];
}

/** V/div range of a typical bench scope at 1× probe. */
export const VOLT_PER_DIV_STEPS = sequence125(1e-3, 10);

/** s/div range of a typical bench scope. */
export const SEC_PER_DIV_STEPS = sequence125(5e-9, 50);

/**
 * Formats an ISO timestamp as German local time.
 * @param iso - ISO-8601 timestamp
 * @param withDate - Include the date ("08.10.2026, 14:02:11")
 * @returns The formatted time, or the input when it cannot be parsed
 */
export function formatTime(iso: string, withDate = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    ...(withDate ? { day: "2-digit", month: "2-digit", year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Formats an ISO timestamp as a German date ("08.10.2026").
 * @param iso - ISO-8601 timestamp
 * @returns The formatted date, or the input when it cannot be parsed
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Formats a duration in seconds as "45 s" or "2 min 05 s".
 * @param seconds - Duration in seconds
 * @returns The formatted duration
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/**
 * Formats a sample count as points ("1,2 MPkt").
 * @param n - Number of samples
 * @returns The formatted count
 */
export function formatPoints(n: number): string {
  return formatSI(n, "Pkt");
}
