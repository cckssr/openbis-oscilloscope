/**
 * Pure helpers behind {@link NumericInput}: tolerant text parsing, range
 * validation and stepping. Kept separate so they are testable without React.
 */
import { parseSI, roundSig, stepInSequence } from "../../../lib/units";
import { de } from "../../../i18n/de";

const t = de.common.numeric;

/** Significant digits kept when rounding committed values (strips float noise). */
const COMMIT_DIGITS = 8;

/**
 * Formats a number for display with a German decimal comma and no grouping.
 * @param value - The number to format
 * @returns E.g. `"0,3"`, or `""` for non-finite input
 */
export function formatPlain(value: number): string {
  if (!Number.isFinite(value)) return "";
  return roundSig(value, 6).toLocaleString("de-DE", {
    maximumFractionDigits: 12,
    useGrouping: false,
  });
}

/**
 * Parses user text: accepts `-`/`−`, `,` or `.`, SI suffixes (`200m`, `5µ`)
 * and a trailing unit (`200 mV`, `0,2 V/div`).
 * @param text - Raw field text
 * @param unit - Unit of the field, e.g. `"V"` or `"V/div"`
 * @returns The parsed number or null when the text is not a number
 */
export function parseNumericText(text: string, unit = ""): number | null {
  const normalised = text.replace(/[−–]/g, "-");
  // Try the full unit ("V/div"), then its base ("V"), so "200 mV" works in a V/div field.
  const candidates = unit ? [unit, unit.split("/")[0]] : [""];
  for (const candidate of candidates) {
    const parsed = parseSI(normalised, candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

/**
 * Removes float noise from a committed value (`0.30000000000000004` → `0.3`).
 * @param value - Raw value
 * @returns The cleaned value
 */
export function cleanValue(value: number): number {
  return roundSig(value, COMMIT_DIGITS);
}

/** Result of validating typed text. */
export type Evaluation =
  | { ok: true; value: number }
  | { ok: false; message: string };

/**
 * Parses and range-checks typed text.
 * @param text - Raw field text
 * @param opts - Unit, bounds and a formatter used in the "max. 10 V" message
 * @returns The committed value or an inline German error message
 */
export function evaluateText(
  text: string,
  opts: {
    unit?: string;
    min?: number;
    max?: number;
    formatBound: (bound: number) => string;
  },
): Evaluation {
  const parsed = parseNumericText(text, opts.unit);
  if (parsed === null) return { ok: false, message: t.invalid };
  const value = cleanValue(parsed);
  if (opts.min !== undefined && value < opts.min * (1 - 1e-9)) {
    return { ok: false, message: t.min(opts.formatBound(opts.min)) };
  }
  if (opts.max !== undefined && value > opts.max * (1 + 1e-9)) {
    return { ok: false, message: t.max(opts.formatBound(opts.max)) };
  }
  return { ok: true, value };
}

/**
 * Computes the next value for the ± buttons and arrow keys.
 * @param base - Current value
 * @param direction - +1 up, -1 down
 * @param opts - Linear `step` or an ascending `sequence`, plus optional bounds
 * @returns The stepped value, clamped to the bounds and free of float noise
 */
export function stepValue(
  base: number,
  direction: 1 | -1,
  opts: { step: number; sequence?: number[]; min?: number; max?: number },
): number {
  let next =
    opts.sequence && opts.sequence.length > 0
      ? stepInSequence(opts.sequence, base, direction)
      : cleanValue(base + direction * opts.step);
  if (opts.min !== undefined) next = Math.max(opts.min, next);
  if (opts.max !== undefined) next = Math.min(opts.max, next);
  return next;
}
