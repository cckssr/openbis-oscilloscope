import type { ReactNode } from "react";
import { cn } from "../ui/utils";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Optional icon element (decorative), e.g. `<Inbox />`. */
  icon?: ReactNode;
  /** Optional call-to-action, e.g. a `<Button>`. */
  action?: ReactNode;
  className?: string;
}

/**
 * Centered "nothing here yet" block with a title, optional explanation and action.
 *
 * @param props - See {@link EmptyStateProps}
 * @returns The empty-state block
 */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-16 text-center", className)}>
      {icon && (
        <div className="text-(--lab-text-secondary) [&_svg]:size-8" aria-hidden>
          {icon}
        </div>
      )}
      <p className="font-medium text-(--lab-text-primary)">{title}</p>
      {description && <p className="max-w-md text-sm text-(--lab-text-secondary)">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
