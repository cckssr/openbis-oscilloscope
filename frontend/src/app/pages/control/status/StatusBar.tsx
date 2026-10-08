import { CircleCheck, Loader2, TriangleAlert, X } from "lucide-react";
import { de } from "../../../../i18n/de";
import { formatDuration } from "../../../../lib/units";
import { Button } from "../../../components/ui/button";
import { Progress } from "../../../components/ui/progress";
import { cn } from "../../../components/ui/utils";
import { useDeviceActions, useDeviceSessionSelector } from "../actions/session";
import type { Job } from "../../../state/deviceSession/types";
import { PROGRESS_CLASS } from "./progressStyle";
import { pickJob } from "./pickJob";
import { useNow } from "./useNow";

const t = de.control.actions.statusBar;

export interface StatusBarProps {
  deviceId: string;
  className?: string;
}

interface BarSlice {
  jobs: Job[];
  busy: string | null;
  /** Number of the newest capture, used in "Aufnahme #5 gespeichert". */
  captureNumber: number | null;
}

const sameSlice = (a: BarSlice, b: BarSlice) =>
  a.jobs === b.jobs && a.busy === b.busy && a.captureNumber === b.captureNumber;

function finishedText(job: Job, captureNumber: number | null): string {
  if (job.status === "cancelled") return t.cancelled;
  if (job.status === "error") {
    const base = t.failed[job.kind];
    return job.error ? `${base}: ${job.error}` : base;
  }
  const done = t.done[job.kind] as (n: number | null) => string;
  return done(captureNumber);
}

/**
 * Persistent status row at the bottom of the control page (review §4.3):
 * the running job with a determinate progress bar or spinner plus elapsed
 * time and "Abbrechen" when cancellable; otherwise the result of the job that
 * just finished; otherwise the busy label or "Bereit". Announced politely to
 * screen readers.
 *
 * @param props - See {@link StatusBarProps}
 * @returns The status row
 */
export function StatusBar({ deviceId, className }: StatusBarProps) {
  const { jobs, busy, captureNumber } = useDeviceSessionSelector(
    deviceId,
    (s): BarSlice => ({
      jobs: s.jobs,
      busy: s.busy,
      captureNumber: s.lastCapture?.number ?? null,
    }),
    sameSlice,
  );
  const actions = useDeviceActions(deviceId);
  const job = pickJob(jobs);
  const running = job?.status === "running";
  const now = useNow(500, running);

  let content;
  if (job && running) {
    const percent =
      job.progress === undefined ? null : Math.round(job.progress * 100);
    content = (
      <>
        <Loader2
          className="size-4 shrink-0 animate-spin text-(--lab-accent)"
          aria-hidden
        />
        <span
          className="min-w-0 shrink truncate font-medium"
          data-testid="status-label"
        >
          {job.label}
        </span>
        {percent !== null ? (
          <>
            <Progress
              value={percent}
              className={cn("h-2 w-24 shrink-0 @md:w-40", PROGRESS_CLASS)}
              aria-label={job.label}
              data-testid="status-progress"
            />
            <span className="shrink-0 tabular-nums text-(--lab-text-secondary)">
              {percent} %
            </span>
          </>
        ) : (
          <span
            className="shrink-0 tabular-nums text-(--lab-text-secondary)"
            data-testid="status-elapsed"
          >
            {t.elapsed(formatDuration((now - job.startedAt) / 1000))}
          </span>
        )}
        {job.detail && (
          <span className="hidden min-w-0 truncate text-(--lab-text-secondary) @lg:inline">
            {job.detail}
          </span>
        )}
        {job.cancellable && job.kind === "full-resolution" && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => void actions.cancelFullResolution()}
          >
            {t.cancel}
          </Button>
        )}
      </>
    );
  } else if (job) {
    const ok = job.status === "done";
    content = (
      <>
        {ok ? (
          <CircleCheck
            className="size-4 shrink-0 text-(--lab-success)"
            aria-hidden
          />
        ) : (
          <TriangleAlert
            className="size-4 shrink-0 text-(--lab-warning)"
            aria-hidden
          />
        )}
        <span
          className="min-w-0 truncate font-medium"
          data-testid="status-result"
        >
          {finishedText(job, captureNumber)}
        </span>
        <button
          type="button"
          aria-label={t.dismiss}
          className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded text-(--lab-text-secondary) hover:bg-(--lab-panel) coarse:size-10"
          onClick={() => actions.dismissJob(job.id)}
        >
          <X className="size-4" aria-hidden />
        </button>
      </>
    );
  } else if (busy) {
    content = (
      <>
        <Loader2
          className="size-4 shrink-0 animate-spin text-(--lab-accent)"
          aria-hidden
        />
        <span className="truncate" data-testid="status-busy">
          {busy}
        </span>
      </>
    );
  } else {
    content = (
      <>
        <span
          className="size-2 shrink-0 rounded-full bg-(--lab-success)"
          aria-hidden
        />
        <span
          className="text-(--lab-text-secondary)"
          data-testid="status-ready"
        >
          {t.ready}
        </span>
      </>
    );
  }

  return (
    <div className={cn("@container", className)}>
      <div
        role="status"
        aria-live="polite"
        data-testid="status-bar"
        className="flex min-h-9 items-center gap-2 border-t border-(--lab-border) bg-(--lab-panel) px-3 py-1 text-sm coarse:min-h-11"
      >
        {content}
      </div>
    </div>
  );
}
