import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";
import { de } from "../../../i18n/de";

export interface HelpPopoverProps {
  /** Explanation shown in the popover. */
  children: ReactNode;
  /** Accessible name of the "?" button (default "Hilfe"); name the topic, e.g. "Hilfe zu Trigger". */
  label?: string;
  /** Optional bold heading inside the popover. */
  title?: string;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Small "?" button that opens a popover with help text, styled like the dark
 * `Tooltip` of the buttons. Works on tap and with the keyboard, unlike
 * hover-only `title` tooltips. The hit area grows to 40 px on touch devices.
 *
 * @param props - See {@link HelpPopoverProps}
 * @returns The trigger button plus popover
 */
export function HelpPopover({
  children,
  label = de.common.actions.help,
  title,
  className,
  side = "bottom",
}: HelpPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-(--lab-text-secondary) transition-colors coarse:size-10",
            "outline-none hover:bg-(--lab-panel) hover:text-(--lab-accent) focus-visible:ring-2 focus-visible:ring-(--lab-accent)/40",
            className,
          )}
        >
          <CircleHelp className="size-4 coarse:size-5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        sideOffset={0}
        // Same look as the dark `Tooltip` used for the button hints.
        className="w-72 max-w-[calc(100vw-2rem)] space-y-1 rounded-md border-0 bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-none"
      >
        {title && <p className="font-medium">{title}</p>}
        <div>{children}</div>
        <PopoverArrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-primary fill-primary" />
      </PopoverContent>
    </Popover>
  );
}
