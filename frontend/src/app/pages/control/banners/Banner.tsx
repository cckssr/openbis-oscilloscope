import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../../components/ui/utils";

export type BannerTone = "danger" | "warning" | "info";

const TONE: Record<BannerTone, string> = {
  danger: "border-(--lab-danger) bg-red-50 text-(--lab-text-primary)",
  warning: "border-(--lab-warning) bg-amber-50 text-(--lab-text-primary)",
  info: "border-(--lab-accent) bg-blue-50 text-(--lab-text-primary)",
};

const ICON_TONE: Record<BannerTone, string> = {
  danger: "text-(--lab-danger)",
  warning: "text-(--lab-warning)",
  info: "text-(--lab-accent)",
};

export interface BannerProps {
  tone: BannerTone;
  icon: LucideIcon;
  /** Bold first line (optional). */
  title?: string;
  children?: ReactNode;
  /** Button(s) on the right; wraps below on narrow screens. */
  action?: ReactNode;
  /** `alert` interrupts screen readers (lost lock); `status` is polite. */
  role?: "alert" | "status";
  className?: string;
  testId?: string;
}

/**
 * Full-width notice above the main area: icon + text (never colour only) and
 * an optional action button.
 *
 * @param props - See {@link BannerProps}
 * @returns The banner
 */
export function Banner({
  tone,
  icon: Icon,
  title,
  children,
  action,
  role = "status",
  className,
  testId,
}: BannerProps) {
  return (
    <div
      role={role}
      data-testid={testId}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 px-4 py-2 text-sm",
        TONE[tone],
        className,
      )}
    >
      <Icon className={cn("size-5 shrink-0", ICON_TONE[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <p>{children}</p>}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      )}
    </div>
  );
}
