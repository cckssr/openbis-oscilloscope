/** A live frame older than this is shown as "veraltet" (review §4.3). */
export const STALE_AFTER_MS = 3000;

/**
 * Formats the age of a frame in German: "0,8 s", "12 s", "1 min 05 s".
 * @param ms - Age in milliseconds (negative values count as 0)
 * @returns The formatted age
 */
export function formatAge(ms: number): string {
  const age = Math.max(0, ms);
  if (age < 10_000) return `${(age / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  const s = Math.round(age / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}
