import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../ui/utils";

/**
 * Styled native `<select>`. Native selects give the best experience on tablets
 * (OS picker) and never clip inside dialogs.
 * @param props - Standard select props
 * @returns The select with a chevron
 */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          "h-9 w-full appearance-none rounded border-2 border-(--lab-border) bg-white pr-9 pl-3 text-sm text-(--lab-text-primary) outline-none focus-visible:border-(--lab-accent) disabled:cursor-not-allowed disabled:bg-(--lab-disabled-bg) disabled:text-(--lab-disabled-text) coarse:h-11",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-(--lab-text-secondary)"
        aria-hidden
      />
    </div>
  );
}
