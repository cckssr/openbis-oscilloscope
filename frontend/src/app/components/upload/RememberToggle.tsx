import { Pin, PinOff } from "lucide-react";
import { de } from "../../../i18n/de";

const t = de.archive.wizard.remember;

interface RememberToggleProps {
  pinned: boolean;
  /** Field name for the accessible label, e.g. "Versuchstitel". */
  fieldLabel: string;
  onToggle: () => void;
}

/**
 * Small "merken" pin: pinned fields are pre-filled the next time, unpinned ones are cleared.
 * @param props - See {@link RememberToggleProps}
 * @returns The toggle button
 */
export function RememberToggle({ pinned, fieldLabel, onToggle }: RememberToggleProps) {
  const Icon = pinned ? Pin : PinOff;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinned}
      aria-label={t.aria(fieldLabel)}
      title={pinned ? t.on : t.off}
      className={`inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--lab-accent)/40 coarse:h-10 coarse:px-2.5 ${
        pinned
          ? "bg-(--lab-accent)/10 text-(--lab-accent)"
          : "text-(--lab-text-secondary) hover:bg-(--lab-panel)"
      }`}
    >
      <Icon className="size-3.5" aria-hidden />
      {t.label}
    </button>
  );
}
