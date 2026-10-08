import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../ui/utils";

export interface DisabledReasonProps {
  /**
   * Why the wrapped control is disabled (German sentence, e.g. "Erst Gerät übernehmen").
   * Pass a falsy value when the control is enabled: children are then rendered untouched.
   */
  reason?: string | null | false;
  /** The (disabled) control. */
  children: ReactNode;
  className?: string;
}

/**
 * Explains a disabled control. On desktop the reason appears as a tooltip on
 * hover/focus; on touch (`coarse:` pointers, where tooltips never show) it is
 * printed as a small line under the control.
 *
 * @param props - See {@link DisabledReasonProps}
 * @returns The control, wrapped with its explanation when `reason` is set
 */
export function DisabledReason({
  reason,
  children,
  className,
}: DisabledReasonProps) {
  if (!reason) return <div className={className}>{children}</div>;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Disabled buttons swallow pointer events; the span receives them instead. */}
          <span
            tabIndex={0}
            className="block outline-none [&>*]:pointer-events-none"
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="coarse:hidden">{reason}</TooltipContent>
      </Tooltip>
      <p className="help-text hidden coarse:block">{reason}</p>
    </div>
  );
}
