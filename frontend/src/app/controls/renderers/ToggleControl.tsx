import { useId } from "react";
import { Switch } from "../../components/ui/switch";
import { cn } from "../../components/ui/utils";
import { useSetting } from "../store";
import type { ToggleControlDef } from "../types";
import { ControlShell } from "./ControlShell";
import { ControlStatus } from "./ControlStatus";
import type { ControlProps } from "./types";

export interface ToggleControlProps extends ControlProps<ToggleControlDef> {
  /** Switch and icon-only status without visible label (channel headers). */
  compact?: boolean;
}

/**
 * On/off setting rendered as a switch whose whole row is the tap target
 * (≥ 44 px on touch).
 *
 * @param props - See {@link ToggleControlProps}
 * @returns The control
 */
export function ToggleControl({
  deviceId,
  def,
  path,
  disabled = false,
  disabledReason,
  compact = false,
}: ToggleControlProps) {
  const id = useId();
  const { value, status, set } = useSetting(deviceId, path);
  const sw = (
    <Switch
      id={id}
      checked={value === true}
      onCheckedChange={set}
      disabled={disabled || value === undefined}
      aria-label={compact ? def.label : undefined}
      className="coarse:h-7 coarse:w-12 [&>span]:coarse:size-6"
    />
  );

  if (compact) {
    return (
      <span
        data-control={path}
        title={disabled ? disabledReason : undefined}
        className={cn("inline-flex items-center gap-2 coarse:min-h-11")}
      >
        <ControlStatus status={status} compact />
        {sw}
      </span>
    );
  }
  return (
    <ControlShell
      inputId={id}
      label={def.label}
      help={def.help}
      status={status}
      title={disabled ? disabledReason : undefined}
      inline
      path={path}
    >
      {sw}
    </ControlShell>
  );
}
