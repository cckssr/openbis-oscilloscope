import type { ComponentProps, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { DisabledReason } from "../../../components/common";
import { Button } from "../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";
import { cn } from "../../../components/ui/utils";
import type { ActionLayout } from "./layout";

export interface ActionButtonProps {
  layout: ActionLayout;
  icon: ReactNode;
  /** Full label (column, bar, accessible name). */
  label: string;
  /** Short label for the 72 px icon rail; defaults to `label`. */
  railLabel?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  onClick: () => void;
  /** Why the button is disabled; falsy means enabled. */
  reason?: string | null;
  /** Show the reason as visible text under the button on touch (column layout only). */
  inlineReason?: boolean;
  /** Tooltip while enabled (explanation plus shortcut). */
  hint?: string;
  /** Replaces the icon by a spinner. */
  loading?: boolean;
  testId?: string;
  className?: string;
}

/** Layout-specific sizing: column = full width row, rail = stacked icon + label, bar = large horizontal. */
const LAYOUT_CLASS: Record<ActionLayout, string> = {
  column: "w-full justify-start",
  rail: "h-auto min-h-12 w-full flex-col gap-0.5 px-1 py-1.5 text-[11px] leading-tight whitespace-normal coarse:min-h-[3.25rem]",
  bar: "h-11 px-4 coarse:h-12",
};

/**
 * One control button that adapts to the column / rail / bar layout and always
 * explains why it is disabled (tooltip on desktop, visible text on touch).
 *
 * @param props - See {@link ActionButtonProps}
 * @returns The button with its tooltip
 */
export function ActionButton({
  layout,
  icon,
  label,
  railLabel,
  variant = "secondary",
  onClick,
  reason,
  inlineReason = false,
  hint,
  loading = false,
  testId,
  className,
}: ActionButtonProps) {
  const button = (
    <Button
      type="button"
      variant={variant}
      disabled={!!reason}
      onClick={onClick}
      aria-label={layout === "rail" ? label : undefined}
      data-testid={testId}
      className={cn(LAYOUT_CLASS[layout], className)}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      <span className={layout === "rail" ? "text-center" : undefined}>
        {layout === "rail" ? (railLabel ?? label) : label}
      </span>
    </Button>
  );

  if (reason) {
    return (
      <DisabledReason
        reason={reason}
        className={cn(layout === "rail" && "w-full", !inlineReason && "[&>p]:hidden!")}
      >
        {button}
      </DisabledReason>
    );
  }
  if (!hint) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={layout === "column" ? "left" : "bottom"}>{hint}</TooltipContent>
    </Tooltip>
  );
}
