import type { Job } from "../../../state/deviceSession/types";

/**
 * Chooses the job the status bar shows: the newest running job (a long
 * series yields to a more specific capture or autoscale job), else the
 * newest finished job, else null.
 * @param jobs - Jobs, newest first
 * @returns The job to show
 */
export function pickJob(jobs: readonly Job[]): Job | null {
  const running = jobs.filter((j) => j.status === "running");
  const specific = running.find((j) => j.kind !== "series");
  return specific ?? running[0] ?? jobs[0] ?? null;
}
