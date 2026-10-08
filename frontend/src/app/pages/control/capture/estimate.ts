/**
 * Rough duration of a full-memory read. The scope transfers on the order of
 * 20 000 points per second and channel over LAN; protocol overhead and the
 * driver make the real value vary, hence a range.
 */
const POINTS_PER_SECOND = 20_000;

/**
 * Estimates the read duration of a full-resolution capture.
 * @param memoryDepth - Samples per channel, or null when unknown
 * @param channelCount - Number of enabled channels (at least 1 is assumed)
 * @returns `[min, max]` seconds, or null when the depth is unknown
 */
export function estimateReadSeconds(
  memoryDepth: number | null,
  channelCount: number,
): [number, number] | null {
  if (!memoryDepth || memoryDepth <= 0) return null;
  const typical = (memoryDepth * Math.max(1, channelCount)) / POINTS_PER_SECOND;
  const min = Math.max(2, Math.round(typical * 0.5));
  const max = Math.max(min + 3, Math.round(typical * 2));
  return [min, max];
}
