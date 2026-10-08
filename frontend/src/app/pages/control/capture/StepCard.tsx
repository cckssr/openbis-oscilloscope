import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "../../../components/ui/utils";

export interface StepCardProps {
  /** 1-based step number. */
  n: number;
  title: string;
  /** done = collapsed with a check mark, active = expanded, todo = collapsed and muted. */
  state: "done" | "active" | "todo";
  /** One line shown next to the title when the card is collapsed. */
  summary?: ReactNode;
  children?: ReactNode;
}

/**
 * One step of the full-resolution wizard. Only the active card shows its body.
 *
 * @param props - See {@link StepCardProps}
 * @returns The card
 */
export function StepCard({
  n,
  title,
  state,
  summary,
  children,
}: StepCardProps) {
  return (
    <section
      aria-current={state === "active" ? "step" : undefined}
      data-testid={`fr-step-${n}`}
      data-state={state}
      className={cn(
        "rounded-lg border p-3",
        state === "active"
          ? "border-(--lab-accent) bg-white"
          : "border-(--lab-border) bg-(--lab-panel)",
        state === "todo" && "text-(--lab-text-secondary)",
      )}
    >
      <header className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            state === "active" && "bg-(--lab-accent) text-white",
            state === "done" && "bg-(--lab-success) text-white",
            state === "todo" && "border border-(--lab-border) bg-white",
          )}
          aria-hidden
        >
          {state === "done" ? <Check className="size-3.5" /> : n}
        </span>
        <h3 className="text-sm font-medium">{title}</h3>
        {state !== "active" && summary && (
          <span className="ml-auto min-w-0 truncate text-xs text-(--lab-text-secondary)">
            {summary}
          </span>
        )}
      </header>
      {state === "active" && children && (
        <div className="mt-3 space-y-3 text-sm">{children}</div>
      )}
    </section>
  );
}
