import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { de } from "../../../i18n/de";

export interface PageHeaderProps {
  title: ReactNode;
  /** Secondary line under the title (e.g. IP address, session date). */
  subtitle?: ReactNode;
  /** Route for the back button, e.g. "/". Omit for no back button. */
  backTo?: string;
  /** Alternative to `backTo` for guarded navigation (e.g. confirm dialog). */
  onBack?: () => void;
  /** Accessible/visible label of the back button (default "Zurück"). */
  backLabel?: string;
  /** Slot next to the title, e.g. `<StatusBadge>`. */
  status?: ReactNode;
  /** Right-aligned slot for buttons and the user menu; wraps below the title on narrow screens. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Consistent top bar for every page: back button, title, status slot and an
 * actions slot. Wraps onto a second row on narrow (tablet portrait) screens.
 *
 * @param props - See {@link PageHeaderProps}
 * @returns The `<header>` element
 */
export function PageHeader({
  title,
  subtitle,
  backTo,
  onBack,
  backLabel = de.common.actions.back,
  status,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-2 border-(--lab-border) bg-white px-4 py-3 sm:px-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {backTo && (
          <Button
            asChild
            variant="secondary"
            size="icon"
            aria-label={backLabel}
            title={backLabel}
          >
            <Link to={backTo}>
              <ArrowLeft />
            </Link>
          </Button>
        )}
        {!backTo && onBack && (
          <Button
            variant="secondary"
            size="icon"
            aria-label={backLabel}
            title={backLabel}
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-(--lab-text-primary)">
            {title}
          </h1>
          {subtitle && <p className="help-text truncate">{subtitle}</p>}
        </div>
        {status}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
