import { Check, Circle, Lock, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { de } from "../../../../i18n/de";
import { cn } from "../../../components/ui/utils";
import type { WorkflowStep } from "../../../state/deviceSession";
import { archivePath } from "../header";
import { useHeaderModel } from "../header/model";
import { useWorkflow } from "./useWorkflow";

const t = de.control.page.stepper;

const ICON: Record<WorkflowStep["state"], LucideIcon> = {
  todo: Circle,
  active: Circle,
  done: Check,
  blocked: Lock,
};

const STATE_CLASS: Record<WorkflowStep["state"], string> = {
  todo: "border-(--lab-border) text-(--lab-text-secondary)",
  active: "border-(--lab-accent) bg-(--lab-accent)/10 text-(--lab-accent) font-semibold",
  done: "border-(--lab-success) text-(--lab-success)",
  blocked: "border-dashed border-(--lab-border) text-(--lab-disabled-text)",
};

export interface StepChipProps {
  step: WorkflowStep;
  index: number;
  /** Compact: only the active step shows its label, the others show icon or number. */
  compact: boolean;
  /** When set, the chip is a link (step ⑤ → archive). */
  href?: string;
  /** Draw the connector line after the chip. */
  connector?: boolean;
}

/**
 * One step: icon or number plus label and a screen-reader state text, so the
 * state is never conveyed by colour alone.
 *
 * @param props - See {@link StepChipProps}
 * @returns A list item
 */
export function StepChip({ step, index, compact, href, connector }: StepChipProps) {
  const Icon = ICON[step.state];
  const showLabel = !compact || step.state === "active";
  const state = t.state[step.state];
  const body = (
    <>
      {step.state === "active" ? (
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-(--lab-accent) text-xs font-bold text-white"
          aria-hidden
        >
          {index + 1}
        </span>
      ) : (
        <Icon className="size-4 shrink-0" aria-hidden />
      )}
      {showLabel ? (
        <span aria-hidden>{step.label}</span>
      ) : (
        step.state !== "done" && step.state !== "blocked" && <span aria-hidden>{index + 1}</span>
      )}
      {showLabel && step.optional && step.state !== "done" && (
        <span aria-hidden className="text-xs font-normal">
          ({t.optional})
        </span>
      )}
      <span className="sr-only">
        {step.label}: {state}
        {step.optional ? `, ${t.optional}` : ""}
      </span>
    </>
  );
  const cls = cn(
    "inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-sm whitespace-nowrap coarse:min-h-10",
    STATE_CLASS[step.state],
  );
  return (
    <li
      className="flex items-center gap-1.5"
      aria-current={step.state === "active" ? "step" : undefined}
      data-step={step.id}
      data-state={step.state}
      title={compact ? `${step.label} – ${state}` : undefined}
    >
      {href ? (
        <Link to={href} className={cn(cls, "hover:bg-(--lab-panel)")} title={t.archiveTitle}>
          {body}
        </Link>
      ) : (
        <span className={cls}>{body}</span>
      )}
      {connector && <span aria-hidden className="h-0.5 w-3 bg-(--lab-border)" />}
    </li>
  );
}

export interface WorkflowStepperProps {
  deviceId: string;
  /** Compact on tablets. */
  compact?: boolean;
  className?: string;
}

/**
 * Workflow strip ① Gerät übernehmen … ⑤ Hochladen with todo / active / done /
 * blocked states and the "Als Nächstes" hint underneath (review §4.1). Step ⑤
 * links to the archive.
 *
 * @param props - See {@link WorkflowStepperProps}
 * @returns The strip
 */
export function WorkflowStepper({ deviceId, compact = false, className }: WorkflowStepperProps) {
  const { steps, next } = useWorkflow(deviceId);
  const { archiveSessionId } = useHeaderModel(deviceId);
  return (
    <nav aria-label={t.ariaLabel} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 border-b-2 border-(--lab-border) bg-(--lab-panel) px-4 py-2", className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {steps.map((s, i) => (
          <StepChip
            key={s.id}
            step={s}
            index={i}
            compact={compact}
            connector={i < steps.length - 1}
            href={s.id === "upload" && s.state !== "blocked" ? archivePath(archiveSessionId) : undefined}
          />
        ))}
      </ol>
      <p className="min-w-0 text-sm text-(--lab-text-primary)" data-testid="next-hint">
        <span className="font-semibold">{t.next}:</span> {next}
      </p>
    </nav>
  );
}
