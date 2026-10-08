import { de } from "../../../i18n/de";

const t = de.devices.card;

/**
 * Formats the lock start time for a device card: "14:02 Uhr" for today,
 * "07.10.2026, 14:02 Uhr" otherwise.
 * @param acquiredAt - Lock start as unix seconds (`LockInfo.acquired_at`)
 * @param now - Reference time (injectable for tests)
 * @returns The German time text
 */
export function formatLockSince(
  acquiredAt: number,
  now: Date = new Date(),
): string {
  const d = new Date(acquiredAt * 1000);
  const time = d.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (d.toDateString() === now.toDateString()) return t.since(time);
  const date = d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return t.sinceDate(date, time);
}
