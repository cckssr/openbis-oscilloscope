/**
 * Job model (review §4.3): every long action registers a job; the UI renders
 * them in a status bar. Finished jobs linger for a few seconds, then drop.
 */
import type { StoreHost } from "./context";
import { uid } from "./context";
import type { Job, JobKind } from "./types";

/** How long a finished job stays visible. */
export const FINISHED_JOB_TTL_MS = 5000;
/** Maximum number of jobs kept in the state. */
export const MAX_JOBS = 10;

export class JobTracker {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly host: StoreHost) {}

  /**
   * Registers a running job (newest first).
   * @param kind - Job category
   * @param label - German title
   * @param options - `cancellable` shows an "Abbrechen" button, `detail` an initial subtitle
   * @returns The job id
   */
  start(
    kind: JobKind,
    label: string,
    options: { cancellable?: boolean; detail?: string } = {},
  ): string {
    const id = uid();
    const job: Job = {
      id,
      kind,
      label,
      detail: options.detail,
      startedAt: this.host.now(),
      status: "running",
      cancellable: options.cancellable ?? false,
    };
    this.host.update((s) => ({
      ...s,
      jobs: [job, ...s.jobs].slice(0, MAX_JOBS),
    }));
    return id;
  }

  /**
   * Updates progress, detail or label of a job.
   * @param id - Job id from {@link start}
   * @param patch - Fields to change
   */
  update(
    id: string,
    patch: Partial<Pick<Job, "progress" | "detail" | "label" | "cancellable">>,
  ): void {
    this.host.update((s) => {
      if (!s.jobs.some((j) => j.id === id)) return s;
      return {
        ...s,
        jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
      };
    });
  }

  /**
   * Ends a job; it disappears after {@link FINISHED_JOB_TTL_MS}.
   * @param id - Job id from {@link start}
   * @param status - Final status
   * @param error - Error message for `error`
   */
  finish(
    id: string,
    status: "done" | "error" | "cancelled",
    error?: string,
  ): void {
    this.host.update((s) => {
      if (!s.jobs.some((j) => j.id === id)) return s;
      return {
        ...s,
        jobs: s.jobs.map((j) =>
          j.id === id
            ? {
                ...j,
                status,
                error,
                endedAt: this.host.now(),
                cancellable: false,
                progress: status === "done" ? 1 : j.progress,
              }
            : j,
        ),
      };
    });
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), FINISHED_JOB_TTL_MS),
    );
  }

  /**
   * Removes a job immediately (the user closed it or its TTL elapsed).
   * @param id - Job id
   */
  dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.host.update((s) =>
      s.jobs.some((j) => j.id === id)
        ? { ...s, jobs: s.jobs.filter((j) => j.id !== id) }
        : s,
    );
  }

  /** Clears all removal timers. */
  dispose(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }
}
