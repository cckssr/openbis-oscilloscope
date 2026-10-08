/** Minutes before the end-of-day reset at which the warning appears. */
export const EOD_WARNING_MINUTES = 10;

function minutesOfDay(now: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  } catch {
    return null;
  }
}

/**
 * Minutes until the daily lock reset, when it is close (review §2.3 P3).
 *
 * @param now - Current time
 * @param resetTime - "HH:MM" in `timeZone` (`AppConfig.eod_reset_time`)
 * @param timeZone - IANA zone (`AppConfig.eod_timezone`)
 * @param windowMinutes - How early to warn
 * @returns Whole minutes left (0 = within the last minute), or null when no warning is due
 */
export function eodMinutesLeft(
  now: Date,
  resetTime: string,
  timeZone: string,
  windowMinutes: number = EOD_WARNING_MINUTES,
): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(resetTime.trim());
  if (!match) return null;
  const reset = Number(match[1]) * 60 + Number(match[2]);
  const current = minutesOfDay(now, timeZone);
  if (current === null) return null;
  const left = (reset - current + 24 * 60) % (24 * 60);
  return left <= windowMinutes ? left : null;
}
