/**
 * Pure grouping logic of the archive: turns the flat artifact list of a session
 * into captures ("Aufnahmen"), series ("Serie n") and day groups for one
 * timeline, newest first. No React, no I/O — unit-tested in groupArtifacts.test.ts.
 */
import type { Artifact } from "../../../api/types";

/** Upload state of a capture as the student sees it. */
export type CaptureStatus = "local" | "selected" | "uploaded";

/**
 * One saved acquisition (all channels) or one screenshot — the unit the
 * student selects, previews and uploads.
 */
export interface Capture {
  /** `acquisition_id`; falls back to the artifact id for screenshots and legacy traces. */
  id: string;
  kind: "trace" | "screenshot";
  /** Set when a note can be stored (`setAnnotation` needs an acquisition id). */
  acquisitionId: string | null;
  /** The channel traces (or the single screenshot) of this capture, by channel. */
  artifacts: Artifact[];
  artifactIds: string[];
  /** Channel numbers of the traces, ascending; empty for screenshots. */
  channels: number[];
  /** Earliest `created_at` of its artifacts. */
  createdAt: string;
  annotation: string | null;
  runId: string | null;
  status: CaptureStatus;
  /** Highest artifact `seq`, used to order captures created in the same second. */
  seq: number;
}

/** A group of ≥ 2 captures that share a `run_id`. */
export interface SeriesGroup {
  type: "series";
  runId: string;
  /** 1-based, oldest series first, so the number stays stable while new ones appear. */
  number: number;
  /** Newest first. */
  captures: Capture[];
  /** `createdAt` of the newest capture; decides the position in the timeline. */
  createdAt: string;
}

export interface CaptureEntry {
  type: "capture";
  capture: Capture;
  createdAt: string;
}

export type TimelineEntry = CaptureEntry | SeriesGroup;

/** All entries of one calendar day (local time). */
export interface DayGroup {
  /** `YYYY-MM-DD` in local time, or "unknown". */
  dayKey: string;
  /** Timestamp of the first entry — format with `formatDate` for the header. */
  date: string;
  entries: TimelineEntry[];
}

export interface Timeline {
  days: DayGroup[];
  /** Every capture in display order (newest first, series members inline). */
  captures: Capture[];
}

/**
 * Derives the upload status of a set of artifacts. A capture with any artifact
 * selected counts as selected (also when it was uploaded before: "Erneut hochladen").
 * @param artifacts - The artifacts of one capture
 * @returns "selected", "uploaded" or "local"
 */
export function statusOf(artifacts: Artifact[]): CaptureStatus {
  if (artifacts.some((a) => a.persist)) return "selected";
  if (artifacts.length > 0 && artifacts.every((a) => a.uploaded)) return "uploaded";
  return "local";
}

function toCapture(
  id: string,
  kind: Capture["kind"],
  acquisitionId: string | null,
  artifacts: Artifact[],
): Capture {
  const sorted = [...artifacts].sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0));
  const times = sorted.map((a) => a.created_at).sort();
  return {
    id,
    kind,
    acquisitionId,
    artifacts: sorted,
    artifactIds: sorted.map((a) => a.artifact_id),
    channels: sorted.flatMap((a) => (a.channel != null ? [a.channel] : [])),
    createdAt: times[0] ?? "",
    annotation: sorted.find((a) => a.annotation)?.annotation ?? null,
    runId: sorted.find((a) => a.run_id)?.run_id ?? null,
    status: statusOf(sorted),
    seq: Math.max(...sorted.map((a) => a.seq)),
  };
}

/**
 * Groups raw artifacts into captures. Traces sharing an `acquisition_id` form one
 * capture; screenshots and legacy traces without an acquisition id are single captures.
 * @param artifacts - Artifacts of one session in any order
 * @returns Captures in arbitrary order
 */
export function buildCaptures(artifacts: Artifact[]): Capture[] {
  const byAcquisition = new Map<string, Artifact[]>();
  const captures: Capture[] = [];
  for (const a of artifacts) {
    if (a.artifact_type === "trace" && a.acquisition_id) {
      const list = byAcquisition.get(a.acquisition_id) ?? [];
      list.push(a);
      byAcquisition.set(a.acquisition_id, list);
    } else {
      const kind = a.artifact_type === "screenshot" ? "screenshot" : "trace";
      captures.push(toCapture(a.artifact_id, kind, null, [a]));
    }
  }
  for (const [acquisitionId, list] of byAcquisition) {
    captures.push(toCapture(acquisitionId, "trace", acquisitionId, list));
  }
  return captures;
}

/** Newest first; equal timestamps fall back to the storage sequence number. */
function newestFirst(a: Capture, b: Capture): number {
  const dt = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (dt !== 0 && !Number.isNaN(dt)) return dt;
  return b.seq - a.seq;
}

/**
 * Local calendar day of an ISO timestamp.
 * @param iso - ISO-8601 timestamp
 * @returns `YYYY-MM-DD` in local time, or "unknown" when unparsable
 */
export function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Builds the archive timeline: one list, newest first, screenshots inline,
 * series (run groups with ≥ 2 captures) collapsed into one entry, split by day.
 * @param artifacts - Artifacts of one session
 * @returns The day groups plus the flat capture order used for ←/→ stepping
 */
export function buildTimeline(artifacts: Artifact[]): Timeline {
  const captures = buildCaptures(artifacts).sort(newestFirst);

  const byRun = new Map<string, Capture[]>();
  for (const c of captures) {
    if (!c.runId) continue;
    const list = byRun.get(c.runId) ?? [];
    list.push(c);
    byRun.set(c.runId, list);
  }
  // Number series by age (oldest = Serie 1); single-capture runs stay plain captures.
  const series = [...byRun.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort(
      ([, a], [, b]) =>
        Date.parse(a[a.length - 1].createdAt) - Date.parse(b[b.length - 1].createdAt),
    );
  const seriesByRun = new Map<string, SeriesGroup>(
    series.map(([runId, list], i) => [
      runId,
      { type: "series", runId, number: i + 1, captures: list, createdAt: list[0].createdAt },
    ]),
  );

  const entries: TimelineEntry[] = [];
  const emitted = new Set<string>();
  for (const c of captures) {
    const group = c.runId ? seriesByRun.get(c.runId) : undefined;
    if (group) {
      if (emitted.has(group.runId)) continue;
      emitted.add(group.runId);
      entries.push(group);
    } else {
      entries.push({ type: "capture", capture: c, createdAt: c.createdAt });
    }
  }

  const days: DayGroup[] = [];
  for (const entry of entries) {
    const dayKey = dayKeyOf(entry.createdAt);
    const last = days[days.length - 1];
    if (last && last.dayKey === dayKey) last.entries.push(entry);
    else days.push({ dayKey, date: entry.createdAt, entries: [entry] });
  }

  const ordered = entries.flatMap((e) => (e.type === "series" ? e.captures : [e.capture]));
  return { days, captures: ordered };
}

/**
 * Counts captures per status.
 * @param captures - Any list of captures
 * @returns Counts for local, selected and uploaded captures
 */
export function countByStatus(captures: Capture[]): Record<CaptureStatus, number> {
  const counts: Record<CaptureStatus, number> = { local: 0, selected: 0, uploaded: 0 };
  for (const c of captures) counts[c.status] += 1;
  return counts;
}

/**
 * Aggregate checkbox state of a group of captures.
 * "disabled" means every capture is already uploaded and cannot be selected by accident.
 * @param captures - Captures of a series or of the whole table
 * @returns "all", "some", "none" or "disabled"
 */
export function selectionState(captures: Capture[]): "all" | "some" | "none" | "disabled" {
  const selectable = captures.filter((c) => c.status !== "uploaded");
  if (selectable.length === 0) return "disabled";
  const selected = selectable.filter((c) => c.status === "selected").length;
  if (selected === 0) return "none";
  return selected === selectable.length ? "all" : "some";
}

/**
 * Captures that a bulk toggle may change (uploaded captures are never touched).
 * @param captures - Captures of a series or of the whole table
 * @returns The captures that are not uploaded yet
 */
export function selectableCaptures(captures: Capture[]): Capture[] {
  return captures.filter((c) => c.status !== "uploaded");
}

/**
 * Applies a new persist value to the matching artifacts (immutable).
 * @param artifacts - Current artifacts
 * @param ids - Artifact ids to change
 * @param persist - New "selected for upload" value
 * @returns A new array; untouched artifacts keep their identity
 */
export function withPersist(artifacts: Artifact[], ids: string[], persist: boolean): Artifact[] {
  const set = new Set(ids);
  return artifacts.map((a) => (set.has(a.artifact_id) ? { ...a, persist } : a));
}

/**
 * Restores previous persist values (rollback of an optimistic update).
 * @param artifacts - Current artifacts
 * @param previous - Map artifact id → value before the optimistic change
 * @returns A new array with the old values restored
 */
export function restorePersist(
  artifacts: Artifact[],
  previous: Map<string, boolean>,
): Artifact[] {
  return artifacts.map((a) =>
    previous.has(a.artifact_id) ? { ...a, persist: previous.get(a.artifact_id)! } : a,
  );
}

/**
 * Sets the note on every artifact of one acquisition (immutable).
 * @param artifacts - Current artifacts
 * @param acquisitionId - The acquisition whose note changes
 * @param annotation - New note text ("" clears it)
 * @returns A new array
 */
export function withAnnotation(
  artifacts: Artifact[],
  acquisitionId: string,
  annotation: string,
): Artifact[] {
  return artifacts.map((a) =>
    a.acquisition_id === acquisitionId ? { ...a, annotation: annotation || null } : a,
  );
}
