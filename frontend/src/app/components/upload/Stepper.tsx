import { Check } from "lucide-react";
import { de } from "../../../i18n/de";
import { STEP_ORDER, type WizardStep } from "./types";

const t = de.archive.wizard.steps;

interface StepperProps {
  current: WizardStep;
  /** Called when a finished step is clicked (jump back). Omit to make the stepper read-only. */
  onStepClick?: (step: WizardStep) => void;
}

/**
 * Progress indicator ① Auswahl — ② Ziel — ③ Angaben — ④ Bestätigen — ⑤ Ergebnis.
 * Only the current label is shown on narrow screens.
 * @param props - See {@link StepperProps}
 * @returns The ordered step list
 */
export function Stepper({ current, onStepClick }: StepperProps) {
  const currentIndex = STEP_ORDER.indexOf(current);
  return (
    <ol className="flex items-center gap-1 text-sm" aria-label={de.archive.wizard.title}>
      {STEP_ORDER.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const clickable = done && onStepClick && current !== "result";
        const circle = (
          <span
            className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${
              active
                ? "border-(--lab-accent) bg-(--lab-accent) text-white"
                : done
                  ? "border-(--lab-success) bg-(--lab-success) text-white"
                  : "border-(--lab-border) text-(--lab-text-secondary)"
            }`}
          >
            {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
          </span>
        );
        const label = (
          <span className={`${active ? "inline" : "hidden lg:inline"} ${active ? "font-medium text-(--lab-text-primary)" : "text-(--lab-text-secondary)"}`}>
            {t[step]}
          </span>
        );
        return (
          <li key={step} className="flex items-center gap-1" aria-current={active ? "step" : undefined}>
            {i > 0 && <span className="mx-1 h-0.5 w-3 bg-(--lab-border) sm:w-6" aria-hidden />}
            {clickable ? (
              <button
                type="button"
                onClick={() => onStepClick(step)}
                className="flex items-center gap-1.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-(--lab-accent)/40"
              >
                {circle}
                {label}
              </button>
            ) : (
              <span className="flex items-center gap-1.5">
                {circle}
                {label}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
