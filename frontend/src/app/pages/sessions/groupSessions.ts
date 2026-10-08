/**
 * Pure helpers of "Meine Messdaten": day grouping and the status of a session.
 * Unit-tested in groupSessions.test.ts.
 */
import type { SessionSummary } from "../../../api/types";

export type SessionStatus =
  /** The session still holds the device lock. */
  | { kind: "active" }
  | { kind: "empty" }
  | { kind: "allUploaded" }
  | { kind: "pending"; count: number };

export interface SessionDay {
  /** `YYYY-MM-DD` in local time, or "unknown". */
  dayKey: string;
  /** Timestamp of the first session of that day. */
  date: string;
  sessions: SessionSummary[];
}

/**
 * Number of captures ("Aufnahmen" plus screenshots) in a session.
 * @param s - Session summary
 * @returns acquisitions + screenshots
 */
export function totalCaptures(s: SessionSummary): number {
  return s.counts.acquisitions + s.counts.screenshots;
}

/**
 * Upload status chip of a session.
 * @param s - Session summary
 * @returns "active" while the device is still controlled, else how much is left to upload
 */
export function sessionStatus(s: SessionSummary): SessionStatus {
  if (s.is_active) return { kind: "active" };
  const total = totalCaptures(s);
  if (total === 0) return { kind: "empty" };
  const pending = total - s.counts.uploaded;
  return pending <= 0
    ? { kind: "allUploaded" }
    : { kind: "pending", count: pending };
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Groups sessions by the local day they started, newest day and session first.
 * @param sessions - Sessions in any order
 * @returns Day groups with sessions sorted by start time, newest first
 */
export function groupSessionsByDay(sessions: SessionSummary[]): SessionDay[] {
  const sorted = [...sessions].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const days: SessionDay[] = [];
  for (const s of sorted) {
    const key = dayKey(s.created_at);
    const last = days[days.length - 1];
    if (last && last.dayKey === key) last.sessions.push(s);
    else days.push({ dayKey: key, date: s.created_at, sessions: [s] });
  }
  return days;
}

/**
 * Whether a day is today / yesterday, for friendlier headers.
 * @param key - `YYYY-MM-DD` day key
 * @param now - Reference time (injectable for tests)
 * @returns "today", "yesterday" or null
 */
export function relativeDay(
  key: string,
  now: Date = new Date(),
): "today" | "yesterday" | null {
  const at = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return dayKey(d.toISOString());
  };
  if (key === at(0)) return "today";
  if (key === at(-1)) return "yesterday";
  return null;
}
