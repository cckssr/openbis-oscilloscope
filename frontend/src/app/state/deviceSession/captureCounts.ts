/** Capture counting over the archive's artifact list. */
import type { Artifact } from "../../../api/types";
import type { CaptureCounts } from "./types";

/**
 * Groups artifacts into captures: all traces with the same `acquisition_id`
 * are one capture; screenshots and legacy traces without an acquisition id
 * count individually.
 * @param artifacts - Result of `listArtifacts(sessionId)`
 * @returns The counts the UI and the workflow selector use
 */
export function countsFromArtifacts(artifacts: Artifact[]): CaptureCounts {
  const groups = new Map<string, Artifact[]>();
  for (const a of artifacts) {
    const key =
      a.artifact_type === "trace" && a.acquisition_id
        ? `acq:${a.acquisition_id}`
        : `single:${a.artifact_id}`;
    const group = groups.get(key);
    if (group) group.push(a);
    else groups.set(key, [a]);
  }

  let withNoteOrFlag = 0;
  let flagged = 0;
  let uploaded = 0;
  for (const members of groups.values()) {
    const isUploaded = members.some((a) => a.uploaded === true);
    const isFlagged = !isUploaded && members.some((a) => a.persist);
    const hasNote = members.some((a) => (a.annotation ?? "").trim() !== "");
    if (isUploaded) uploaded += 1;
    if (isFlagged) flagged += 1;
    if (!isUploaded && (hasNote || isFlagged)) withNoteOrFlag += 1;
  }
  const total = groups.size;
  return {
    total,
    withNoteOrFlag,
    flagged,
    uploaded,
    notUploaded: total - uploaded,
  };
}

/**
 * Counts after one more capture was saved in this tab (before the archive is re-read).
 * @param counts - Current counts
 * @returns Counts with one additional, not yet uploaded capture
 */
export function countsWithNewCapture(counts: CaptureCounts): CaptureCounts {
  return {
    ...counts,
    total: counts.total + 1,
    notUploaded: counts.notUploaded + 1,
  };
}
