/**
 * Single source of truth for channel identity and colour. Colours follow the
 * Rigol DS1000Z front panel (CH1 yellow, CH2 cyan, CH3 magenta, CH4 blue) so
 * the screen matches the device; they are defined as CSS variables
 * `--ch{n}-color` in `styles/theme.css` and read from there at runtime.
 */

/** Fallbacks used before the stylesheet is available (tests, SSR). */
const FALLBACK_COLORS = ["#d4a500", "#00a3c4", "#c026d3", "#2563eb"];

/** Colours for non-channel traces (math, reference, analysis). */
const EXTRA_COLORS = ["#6b7280", "#059669", "#dc2626", "#7c3aed"];

/**
 * Returns the colour of an analog channel, read from `--ch{n}-color`.
 * @param channel - 1-based channel number
 * @returns A CSS colour string usable in Plotly and inline styles
 */
export function channelColor(channel: number): string {
  const fallback =
    FALLBACK_COLORS[(channel - 1) % FALLBACK_COLORS.length] ?? EXTRA_COLORS[0];
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--ch${channel}-color`)
    .trim();
  return value || fallback;
}

/**
 * Returns a colour for the n-th non-channel trace (math, reference, FFT …).
 * @param index - 0-based index among the extra traces
 * @returns A CSS colour string
 */
export function extraTraceColor(index: number): string {
  return EXTRA_COLORS[index % EXTRA_COLORS.length];
}

/**
 * Display label of a channel ("CH1").
 * @param channel - 1-based channel number
 * @returns The label
 */
export function channelLabel(channel: number): string {
  return `CH${channel}`;
}

/**
 * Lists the channel numbers of a scope.
 * @param count - Number of analog channels reported by the driver
 * @returns [1, 2, …, count]
 */
export function channelNumbers(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}
