import { CircleCheck, OctagonX, TriangleAlert } from "lucide-react";
import { de } from "../../../../i18n/de";
import { channelColor, channelLabel } from "../../../../lib/channels";
import { formatDuration, formatPoints } from "../../../../lib/units";
import { Progress } from "../../../components/ui/progress";
import { cn } from "../../../components/ui/utils";
import type { Job } from "../../../state/deviceSession/types";
import { PROGRESS_CLASS } from "../status/progressStyle";
import { useNow } from "../status/useNow";
import { estimateReadSeconds } from "./estimate";

const t = de.control.actions.fullResolution;

/** Coloured channel chips ("CH1 CH2"); text plus colour, never colour alone. */
export function ChannelChips({ channels }: { channels: number[] }) {
  if (channels.length === 0) return <span>{t.check.noChannels}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {channels.map((ch) => (
        <span
          key={ch}
          className="inline-flex items-center gap-1 rounded border border-(--lab-border) bg-white px-1.5 py-0.5 text-xs font-medium"
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: channelColor(ch) }} aria-hidden />
          {channelLabel(ch)}
        </span>
      ))}
    </span>
  );
}

/** Step 1: what happens. */
export function ExplainBody() {
  return (
    <>
      <p>{t.explain.lead}</p>
      <p>{t.explain.stopped}</p>
      <p>{t.explain.useful}</p>
    </>
  );
}

/** Step 2: current settings, estimate and what to change on the front panel. */
export function CheckBody({
  memoryDepth,
  channels,
}: {
  memoryDepth: number | null;
  channels: number[];
}) {
  const range = estimateReadSeconds(memoryDepth, channels.length);
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        <dt className="text-(--lab-text-secondary)">{t.check.depth}</dt>
        <dd className="font-medium tabular-nums" data-testid="fr-depth">
          {memoryDepth ? formatPoints(memoryDepth) : t.check.depthUnknown}
        </dd>
        <dt className="text-(--lab-text-secondary)">{t.check.channels}</dt>
        <dd>
          <ChannelChips channels={channels} />
        </dd>
        <dt className="text-(--lab-text-secondary)">{t.check.duration}</dt>
        <dd className="font-medium" data-testid="fr-estimate">
          {range
            ? t.check.durationRange(formatDuration(range[0]), formatDuration(range[1]))
            : t.check.durationUnknown}
        </dd>
      </dl>
      <div className="rounded border border-(--lab-border) bg-(--lab-panel) p-2.5">
        <p className="font-medium">{t.check.change}</p>
        <p className="mt-1">{t.check.changeHow}</p>
        <p className="mt-1 text-(--lab-text-secondary)">{t.check.changeWhy}</p>
      </div>
    </>
  );
}

/** Step 3: determinate progress when the job reports it, else indeterminate with elapsed time. */
export function ReadBody({ job }: { job: Job | null }) {
  const now = useNow(500, true);
  const percent = job?.progress === undefined ? null : Math.round(job.progress * 100);
  const elapsed = job ? formatDuration((now - job.startedAt) / 1000) : null;
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <p className="font-medium">{job?.detail ?? (job ? t.read.reading : t.read.waiting)}</p>
      <Progress
        value={percent ?? 100}
        aria-label={t.read.reading}
        data-testid="fr-progress"
        data-determinate={percent !== null}
        className={cn(PROGRESS_CLASS, percent === null && "animate-pulse")}
      />
      <p className="flex justify-between text-xs tabular-nums text-(--lab-text-secondary)">
        <span>{elapsed ? t.read.elapsed(elapsed) : ""}</span>
        {percent !== null && <span>{t.read.percent(percent)}</span>}
      </p>
      <p className="text-xs text-(--lab-text-secondary)">{t.read.closeHint}</p>
    </div>
  );
}

export type Outcome =
  | { kind: "done"; points: number | null; number: number | null }
  | { kind: "cancelled" }
  | { kind: "error"; message?: string };

/** Step 4: result of the read. */
export function DoneBody({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === "done") {
    return (
      <div className="flex items-start gap-2" data-testid="fr-result" data-kind="done">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-(--lab-success)" aria-hidden />
        <div>
          <p className="font-medium">{t.done.title}</p>
          {outcome.points !== null && <p>{t.done.points(formatPoints(outcome.points))}</p>}
          {outcome.number !== null && <p className="text-(--lab-text-secondary)">{t.done.saved(outcome.number)}</p>}
        </div>
      </div>
    );
  }
  if (outcome.kind === "cancelled") {
    return (
      <div className="flex items-start gap-2" data-testid="fr-result" data-kind="cancelled">
        <OctagonX className="mt-0.5 size-5 shrink-0 text-(--lab-warning)" aria-hidden />
        <div>
          <p className="font-medium">{t.done.cancelledTitle}</p>
          <p className="text-(--lab-text-secondary)">{t.done.cancelled}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2" data-testid="fr-result" data-kind="error">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-(--lab-danger)" aria-hidden />
      <div>
        <p className="font-medium">{t.done.errorTitle}</p>
        <p className="text-(--lab-text-secondary)">{outcome.message ?? t.done.errorFallback}</p>
      </div>
    </div>
  );
}
