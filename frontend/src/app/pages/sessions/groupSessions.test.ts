import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../../../api/types";
import { groupSessionsByDay, relativeDay, sessionStatus, totalCaptures } from "./groupSessions";

function session(over: Partial<Omit<SessionSummary, "counts">> & { counts?: Partial<SessionSummary["counts"]> }): SessionSummary {
  const { counts, ...rest } = over;
  return {
    session_id: "s",
    device_id: "scope-01",
    device_label: "Scope 1",
    owner_user: "u",
    created_at: "2026-10-08T10:00:00",
    last_activity: "2026-10-08T10:00:00",
    is_active: false,
    counts: { acquisitions: 0, screenshots: 0, flagged: 0, uploaded: 0, ...counts },
    ...rest,
  };
}

describe("sessionStatus", () => {
  it("is active while the lock is held, regardless of counts", () => {
    expect(sessionStatus(session({ is_active: true, counts: { acquisitions: 3 } }))).toEqual({ kind: "active" });
  });
  it("detects empty, fully uploaded and pending sessions", () => {
    expect(sessionStatus(session({}))).toEqual({ kind: "empty" });
    expect(sessionStatus(session({ counts: { acquisitions: 4, uploaded: 4 } }))).toEqual({ kind: "allUploaded" });
    expect(sessionStatus(session({ counts: { acquisitions: 4, screenshots: 1, uploaded: 3 } }))).toEqual({
      kind: "pending",
      count: 2,
    });
  });
  it("counts screenshots as captures", () => {
    expect(totalCaptures(session({ counts: { acquisitions: 2, screenshots: 3 } }))).toBe(5);
  });
});

describe("groupSessionsByDay", () => {
  it("groups by local day, newest first", () => {
    const days = groupSessionsByDay([
      session({ session_id: "a", created_at: "2026-10-07T09:00:00" }),
      session({ session_id: "b", created_at: "2026-10-08T09:00:00" }),
      session({ session_id: "c", created_at: "2026-10-08T14:00:00" }),
    ]);
    expect(days.map((d) => d.dayKey)).toEqual(["2026-10-08", "2026-10-07"]);
    expect(days[0].sessions.map((s) => s.session_id)).toEqual(["c", "b"]);
  });
  it("returns nothing for no sessions", () => {
    expect(groupSessionsByDay([])).toEqual([]);
  });
});

describe("relativeDay", () => {
  it("labels today and yesterday", () => {
    const now = new Date(2026, 9, 8, 12, 0, 0);
    expect(relativeDay("2026-10-08", now)).toBe("today");
    expect(relativeDay("2026-10-07", now)).toBe("yesterday");
    expect(relativeDay("2026-10-01", now)).toBeNull();
  });
});
