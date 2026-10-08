import { useId, useMemo } from "react";
import { SegmentedControl } from "../../components/SegmentedControl";
import { resolve } from "../paths";
import { useSetting } from "../store";
import type { EnumControlDef } from "../types";
import { ControlShell } from "./ControlShell";
import type { ControlProps } from "./types";

/**
 * Single-choice setting: toggle buttons for up to three options, a dropdown
 * for more (see `SegmentedControl`). Option lists may depend on the context,
 * e.g. trigger sources follow the channel count. Numeric option values
 * (probe factor) are written back as numbers.
 *
 * @param props - See {@link ControlProps}
 * @returns The control
 */
export function EnumControl({
  deviceId,
  def,
  path,
  ctx,
  disabled = false,
  disabledReason,
}: ControlProps<EnumControlDef>) {
  const id = useId();
  const { value, status, set } = useSetting(deviceId, path);
  const options = useMemo(() => resolve(def.options, ctx), [def.options, ctx]);
  const segments = useMemo(
    () =>
      options.map((o) => ({
        value: String(o.value),
        label: o.label,
        help: o.help,
      })),
    [options],
  );

  return (
    <ControlShell
      inputId={id}
      label={def.label}
      help={def.help}
      status={status}
      title={disabled ? disabledReason : undefined}
      path={path}
    >
      <SegmentedControl
        id={id}
        aria-label={def.label}
        options={segments}
        value={value === undefined ? "" : String(value)}
        onChange={(next) => {
          const option = options.find((o) => String(o.value) === next);
          if (option) set(option.value);
        }}
        disabled={disabled || value === undefined}
      />
    </ControlShell>
  );
}
