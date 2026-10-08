import type { ReactNode } from "react";
import { HelpPopover } from "../../components/common";
import { cn } from "../../components/ui/utils";
import { de } from "../../../i18n/de";
import type { SettingStatus } from "../../state/deviceSession/types";
import { ControlStatus } from "./ControlStatus";

export interface ControlShellProps {
  /** Id of the input the label points to. */
  inputId: string;
  label: string;
  help?: string;
  status: SettingStatus | undefined;
  /** Shown as tooltip while the control is read-only. */
  title?: string;
  /** Put the input on the label row (toggles) instead of below it. */
  inline?: boolean;
  /** Data attribute for tests and e2e: the setting path. */
  path: string;
  children: ReactNode;
}

/**
 * Common frame of a settings control: label, "?" help popover, apply status
 * and the input. Wraps on narrow containers so nothing is clipped.
 *
 * @param props - See {@link ControlShellProps}
 * @returns The framed control
 */
export function ControlShell({
  inputId,
  label,
  help,
  status,
  title,
  inline = false,
  path,
  children,
}: ControlShellProps) {
  const header = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-(--lab-text-primary) coarse:text-base"
      >
        {label}
      </label>
      {help && <HelpPopover label={de.settings.help(label)}>{help}</HelpPopover>}
      <ControlStatus status={status} className="ml-auto basis-auto" />
    </div>
  );
  return (
    <div data-control={path} title={title} className={cn("min-w-0", !inline && "space-y-1")}>
      {inline ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{header}</div>
          {children}
        </div>
      ) : (
        <>
          {header}
          {children}
        </>
      )}
    </div>
  );
}
