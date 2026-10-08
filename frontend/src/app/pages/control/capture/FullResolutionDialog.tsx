import { useState } from "react";
import { de } from "../../../../i18n/de";
import { DisabledReason } from "../../../components/common";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import type { Job } from "../../../state/deviceSession/types";
import { availability } from "../actions/availability";
import { useActionModel, useDeviceActions, useDeviceSessionSelector } from "../actions/session";
import { formatPoints } from "../../../../lib/units";
import {
  CheckBody,
  ChannelChips,
  DoneBody,
  ExplainBody,
  ReadBody,
  type Outcome,
} from "./FullResolutionCards";
import { StepCard } from "./StepCard";

const t = de.control.actions.fullResolution;

export interface FullResolutionDialogProps {
  deviceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = "explain" | "check" | "run";

interface Slice {
  memoryDepth: number | null;
  channels: number[];
  /** Newest full-resolution job. */
  job: Job | null;
  /** Result of the newest capture if it was read with full resolution. */
  last: { number: number; points: number } | null;
}

const sameSlice = (a: Slice, b: Slice) =>
  a.memoryDepth === b.memoryDepth &&
  a.job === b.job &&
  a.channels.join() === b.channels.join() &&
  a.last?.number === b.last?.number &&
  a.last?.points === b.last?.points;

function useSlice(deviceId: string): Slice {
  return useDeviceSessionSelector(
    deviceId,
    (s): Slice => ({
      memoryDepth: s.memoryDepth,
      channels: Object.entries(s.settings.applied?.channels ?? {})
        .filter(([, c]) => c.enabled)
        .map(([n]) => Number(n))
        .sort((a, b) => a - b),
      job: s.jobs.find((j) => j.kind === "full-resolution") ?? null,
      last: s.lastCapture?.fullResolution
        ? { number: s.lastCapture.number, points: s.lastCapture.frame.memoryDepth }
        : null,
    }),
    sameSlice,
  );
}

function outcomeOf(job: Job | null, slice: Slice, settled: boolean): Outcome | null {
  if (job && job.status !== "running") {
    if (job.status === "cancelled") return { kind: "cancelled" };
    if (job.status === "error") return { kind: "error", message: job.error };
    return { kind: "done", points: slice.last?.points ?? null, number: slice.last?.number ?? null };
  }
  // The call returned without ever creating a job (e.g. no channel active): a toast already explained.
  if (!job && settled) return { kind: "error" };
  return null;
}

function FullResolutionContent({ deviceId, onClose }: { deviceId: string; onClose: () => void }) {
  const actions = useDeviceActions(deviceId);
  const model = useActionModel(deviceId);
  const slice = useSlice(deviceId);
  const reopenedWhileReading = slice.job?.status === "running";
  const [phase, setPhase] = useState<Phase>(reopenedWhileReading ? "run" : "explain");
  const [settled, setSettled] = useState(false);
  // Ignore jobs from before this run (e.g. an old finished one still in the status bar).
  const [runSince, setRunSince] = useState(reopenedWhileReading ? 0 : Number.POSITIVE_INFINITY);

  const job = slice.job && slice.job.startedAt >= runSince ? slice.job : null;
  const outcome = phase === "run" ? outcomeOf(job, slice, settled) : null;
  const step = outcome ? 4 : phase === "run" ? 3 : phase === "check" ? 2 : 1;
  const startReason = availability(model).fullResolution.reason;

  const start = () => {
    setRunSince(Date.now());
    setSettled(false);
    setPhase("run");
    void actions.saveFullResolution().finally(() => setSettled(true));
  };

  const state = (n: number) => (n < step ? "done" : n === step ? "active" : "todo");
  const depthText = slice.memoryDepth ? formatPoints(slice.memoryDepth) : t.check.depthUnknown;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.title}</DialogTitle>
        <DialogDescription>
          {t.description} <span className="sr-only">{t.stepOf(step, 4)}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <StepCard n={1} title={t.steps.explain} state={state(1)}>
          <ExplainBody />
        </StepCard>
        <StepCard
          n={2}
          title={t.steps.check}
          state={state(2)}
          summary={
            <span className="inline-flex items-center gap-2">
              {depthText} <ChannelChips channels={slice.channels} />
            </span>
          }
        >
          <CheckBody memoryDepth={slice.memoryDepth} channels={slice.channels} />
        </StepCard>
        <StepCard n={3} title={t.steps.read} state={state(3)}>
          <ReadBody job={job} />
        </StepCard>
        <StepCard n={4} title={t.steps.done} state={state(4)}>
          {outcome && <DoneBody outcome={outcome} />}
        </StepCard>
      </div>

      <DialogFooter>
        {step === 1 && (
          <>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t.buttons.close}
            </Button>
            <Button type="button" variant="primary" onClick={() => setPhase("check")}>
              {t.buttons.next}
            </Button>
          </>
        )}
        {step === 2 && (
          <>
            <Button type="button" variant="secondary" onClick={() => setPhase("explain")}>
              {t.buttons.back}
            </Button>
            <DisabledReason reason={startReason}>
              <Button type="button" variant="primary" disabled={!!startReason} onClick={start}>
                {t.buttons.start}
              </Button>
            </DisabledReason>
          </>
        )}
        {step === 3 && (
          <>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t.buttons.close}
            </Button>
            {job?.cancellable && (
              <Button type="button" variant="danger" onClick={() => void actions.cancelFullResolution()}>
                {t.buttons.cancel}
              </Button>
            )}
          </>
        )}
        {step === 4 && outcome && (
          <>
            {outcome.kind === "done" ? (
              <Button type="button" variant="primary" onClick={onClose}>
                {t.buttons.showInPlot}
              </Button>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={onClose}>
                  {t.buttons.close}
                </Button>
                <DisabledReason reason={startReason}>
                  <Button type="button" variant="primary" disabled={!!startReason} onClick={start}>
                    {t.buttons.retry}
                  </Button>
                </DisabledReason>
              </>
            )}
          </>
        )}
      </DialogFooter>
    </>
  );
}

/**
 * Guided "Volle Auflösung" read in four steps: ① what happens, ② check the
 * settings (memory depth, channels, duration estimate, what to change on the
 * scope), ③ reading with progress and "Abbrechen", ④ result. Closing the
 * dialog while reading keeps the job running (it stays in the status bar);
 * reopening it shows the progress again.
 *
 * @param props - See {@link FullResolutionDialogProps}
 * @returns The dialog
 */
export function FullResolutionDialog({ deviceId, open, onOpenChange }: FullResolutionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="full-resolution-dialog">
        {/* Radix unmounts the content after the exit animation, which resets the wizard for the next opening. */}
        <FullResolutionContent deviceId={deviceId} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
