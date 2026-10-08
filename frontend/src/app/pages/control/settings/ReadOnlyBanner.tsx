import { Lock } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { de } from "../../../../i18n/de";

const t = de.settings.inspector;

export interface ReadOnlyBannerProps {
  /** Replaces the default sentence, e.g. when another tab controls the device. */
  reason?: string;
  /** Shows the "Gerät übernehmen" button when given. */
  onTakeControl?: () => void;
}

/**
 * Visible reason why the settings cannot be edited, with a button to take the
 * device. Stays at the top while the settings scroll.
 *
 * @param props - See {@link ReadOnlyBannerProps}
 * @returns The banner
 */
export function ReadOnlyBanner({ reason, onTakeControl }: ReadOnlyBannerProps) {
  return (
    <div
      role="status"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded border-2 border-(--lab-warning) bg-white p-2 coarse:p-3"
    >
      <Lock className="size-4 shrink-0 text-(--lab-warning)" aria-hidden />
      <p className="min-w-0 flex-1 basis-40 text-sm text-(--lab-text-primary) coarse:text-base">
        {reason ?? t.readOnlyBanner}
      </p>
      {onTakeControl && (
        <Button size="sm" variant="secondary" className="coarse:h-11" onClick={onTakeControl}>
          {t.takeControl}
        </Button>
      )}
    </div>
  );
}
