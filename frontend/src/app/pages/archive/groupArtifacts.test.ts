import { describe, expect, it } from "vitest";
import type { Artifact } from "../../../api/types";
import {
  buildTimeline,
  countByStatus,
  restorePersist,
  selectionState,
  statusOf,
  withAnnotation,
  withPersist,
} from "./groupArtifacts";

let seq = 0;
function art(over: Partial<Artifact>): Artifact {
  seq += 1;
  return {
    artifact_id: `a${seq}`,
    artifact_type: "trace",
    channel: 1,
    seq,
    persist: false,
    created_at: "2026-10-08T10:00:00Z",
    files: [],
    acquisition_id: null,
    annotation: null,
    run_id: null,
    uploaded: false,
    uploaded_at: null,
    perm_id: null,
    ...over,
  };
}

describe("buildTimeline", () => {
  it("merges the channel traces of one acquisition into one capture", () => {
    const t = buildTimeline([
      art({ acquisition_id: "q1", channel: 2, annotation: "Resonanz" }),
      art({ acquisition_id: "q1", channel: 1 }),
    ]);
    expect(t.captures).toHaveLength(1);
    expect(t.captures[0].channels).toEqual([1, 2]);
    expect(t.captures[0].annotation).toBe("Resonanz");
    expect(t.captures[0].acquisitionId).toBe("q1");
  });

  it("orders everything newest first with screenshots inline", () => {
    const t = buildTimeline([
      art({ acquisition_id: "q1", created_at: "2026-10-08T10:00:00Z" }),
      art({
        artifact_type: "screenshot",
        channel: null,
        created_at: "2026-10-08T10:05:00Z",
      }),
      art({ acquisition_id: "q2", created_at: "2026-10-08T10:10:00Z" }),
    ]);
    expect(t.captures.map((c) => c.kind)).toEqual([
      "trace",
      "screenshot",
      "trace",
    ]);
    expect(t.captures.map((c) => c.id)).toEqual([
      "q2",
      expect.any(String),
      "q1",
    ]);
  });

  it("falls back to seq for captures with identical timestamps", () => {
    const t = buildTimeline([
      art({ acquisition_id: "old", seq: 1 }),
      art({ acquisition_id: "new", seq: 2 }),
    ]);
    expect(t.captures.map((c) => c.id)).toEqual(["new", "old"]);
  });

  it("keeps legacy traces without acquisition id as single captures without note target", () => {
    const t = buildTimeline([
      art({ artifact_id: "legacy" }),
      art({ artifact_id: "legacy2" }),
    ]);
    expect(t.captures).toHaveLength(2);
    expect(t.captures.every((c) => c.acquisitionId === null)).toBe(true);
  });

  it("groups runs with two or more captures into numbered series, oldest = Serie 1", () => {
    const t = buildTimeline([
      art({
        acquisition_id: "a",
        run_id: "r1",
        created_at: "2026-10-08T09:00:00Z",
      }),
      art({
        acquisition_id: "b",
        run_id: "r1",
        created_at: "2026-10-08T09:01:00Z",
      }),
      art({
        acquisition_id: "c",
        run_id: "r2",
        created_at: "2026-10-08T10:00:00Z",
      }),
      art({
        acquisition_id: "d",
        run_id: "r2",
        created_at: "2026-10-08T10:01:00Z",
      }),
      art({
        acquisition_id: "e",
        run_id: "r3",
        created_at: "2026-10-08T11:00:00Z",
      }),
    ]);
    const entries = t.days.flatMap((d) => d.entries);
    expect(entries.map((e) => e.type)).toEqual(["capture", "series", "series"]);
    const series = entries.filter((e) => e.type === "series");
    expect(series.map((s) => [s.runId, s.number])).toEqual([
      ["r2", 2],
      ["r1", 1],
    ]);
    expect(series[0].captures.map((c) => c.id)).toEqual(["d", "c"]);
    // flat order follows the display order
    expect(t.captures.map((c) => c.id)).toEqual(["e", "d", "c", "b", "a"]);
  });

  it("splits entries into day groups (header once per day)", () => {
    const t = buildTimeline([
      art({ acquisition_id: "a", created_at: "2026-10-07T12:00:00" }),
      art({ acquisition_id: "b", created_at: "2026-10-08T12:00:00" }),
      art({ acquisition_id: "c", created_at: "2026-10-08T13:00:00" }),
    ]);
    expect(t.days.map((d) => d.dayKey)).toEqual(["2026-10-08", "2026-10-07"]);
    expect(t.days[0].entries).toHaveLength(2);
  });

  it("returns an empty timeline for no artifacts", () => {
    expect(buildTimeline([])).toEqual({ days: [], captures: [] });
  });
});

describe("status helpers", () => {
  it("derives status: selected wins, then uploaded, else local", () => {
    expect(statusOf([art({ persist: true, uploaded: true })])).toBe("selected");
    expect(statusOf([art({ uploaded: true }), art({ uploaded: true })])).toBe(
      "uploaded",
    );
    expect(statusOf([art({ uploaded: true }), art({})])).toBe("local");
    expect(statusOf([art({})])).toBe("local");
  });

  it("counts and aggregates selection state, ignoring uploaded captures", () => {
    const t = buildTimeline([
      art({ acquisition_id: "a", persist: true }),
      art({ acquisition_id: "b" }),
      art({ acquisition_id: "c", uploaded: true }),
    ]);
    expect(countByStatus(t.captures)).toEqual({
      local: 1,
      selected: 1,
      uploaded: 1,
    });
    expect(selectionState(t.captures)).toBe("some");
    expect(
      selectionState(t.captures.filter((c) => c.status === "uploaded")),
    ).toBe("disabled");
    expect(
      selectionState(t.captures.filter((c) => c.status === "selected")),
    ).toBe("all");
    expect(selectionState(t.captures.filter((c) => c.status === "local"))).toBe(
      "none",
    );
  });
});

describe("immutable updates", () => {
  it("sets and rolls back persist", () => {
    const list = [art({ artifact_id: "x" }), art({ artifact_id: "y" })];
    const next = withPersist(list, ["x"], true);
    expect(next.map((a) => a.persist)).toEqual([true, false]);
    expect(next[1]).toBe(list[1]);
    const back = restorePersist(next, new Map([["x", false]]));
    expect(back.map((a) => a.persist)).toEqual([false, false]);
  });

  it("sets the note on all traces of an acquisition", () => {
    const list = [
      art({ acquisition_id: "q" }),
      art({ acquisition_id: "q" }),
      art({ acquisition_id: "z" }),
    ];
    expect(withAnnotation(list, "q", "Hallo").map((a) => a.annotation)).toEqual(
      ["Hallo", "Hallo", null],
    );
    expect(withAnnotation(list, "q", "").map((a) => a.annotation)).toEqual([
      null,
      null,
      null,
    ]);
  });
});
