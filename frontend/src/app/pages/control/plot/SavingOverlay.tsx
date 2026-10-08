import { LoaderCircle } from "lucide-react";
import { de } from "../../../../i18n/de";

/**
 * Dims the plot while a capture is being saved ("Wird gespeichert…"). Lets
 * pointer events through so zooming still works.
 *
 * @returns The overlay
 */
export function SavingOverlay() {
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60"
      data-testid="saving-overlay"
    >
      <span className="flex items-center gap-2 rounded border-2 border-(--lab-border) bg-white px-4 py-2 text-sm font-medium shadow-sm">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        {de.control.page.plot.saving}
      </span>
    </div>
  );
}
