import type { ReactNode } from "react";
import { HelpPopover } from "../common";
import { de } from "../../../i18n/de";
import { RememberToggle } from "./RememberToggle";

/** Lab styling for text inputs and textareas inside wizard fields. */
export const inputClass =
  "rounded border-2 border-(--lab-border) bg-white text-sm focus-visible:border-(--lab-accent) focus-visible:ring-0 coarse:min-h-11";

interface FieldProps {
  /** Id of the control inside, for the label. */
  htmlFor: string;
  label: string;
  required?: boolean;
  /** Marks the field as optional in the label. */
  optional?: boolean;
  /** Plain-German help; openBIS property names belong here, not in the label. */
  help?: ReactNode;
  /** Shows the "merken" pin when given. */
  remember?: { pinned: boolean; onToggle: () => void };
  error?: string | null;
  children: ReactNode;
}

/**
 * Form field frame: label, required/optional marker, "?" help popover, "merken" pin and error line.
 * @param props - See {@link FieldProps}
 * @returns The labelled field
 */
export function Field({ htmlFor, label, required, optional, help, remember, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-6 items-center gap-1">
        <label htmlFor={htmlFor} className="text-sm font-medium text-(--lab-text-primary)">
          {label}
          {required && (
            <span className="ml-0.5 text-(--lab-danger)" aria-hidden>
              *
            </span>
          )}
        </label>
        {optional && (
          <span className="text-xs text-(--lab-text-secondary)">({de.archive.wizard.target.optional})</span>
        )}
        {help && <HelpPopover label={`Hilfe: ${label}`}>{help}</HelpPopover>}
        <span className="flex-1" />
        {remember && <RememberToggle pinned={remember.pinned} fieldLabel={label} onToggle={remember.onToggle} />}
      </div>
      {children}
      {error && <p className="text-xs text-(--lab-danger)">{error}</p>}
    </div>
  );
}
