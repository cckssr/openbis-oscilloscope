import { useId, useMemo } from "react";
import { NumericInput } from "../../components/NumericInput";
import { formatSI, sequence125 } from "../../../lib/units";
import { resolve } from "../paths";
import { useSetting } from "../store";
import type { NumberControlDef } from "../types";
import { ControlShell } from "./ControlShell";
import type { ControlProps } from "./types";

/**
 * Numeric setting: label, help, {@link NumericInput} with units, 1-2-5 or
 * linear stepping and range checks, and the per-control apply status.
 * Committed values go to the store immediately (debounced there).
 *
 * @param props - See {@link ControlProps}
 * @returns The control
 */
export function NumberControl({
  deviceId,
  def,
  path,
  ctx,
  disabled = false,
  disabledReason,
}: ControlProps<NumberControlDef>) {
  const id = useId();
  const { value, status, set } = useSetting(deviceId, path);
  const min = def.min === undefined ? undefined : resolve(def.min, ctx);
  const max = def.max === undefined ? undefined : resolve(def.max, ctx);
  const step = def.step === undefined ? 0.1 : resolve(def.step, ctx);

  const steps = useMemo(() => {
    if (Array.isArray(def.scale)) return def.scale;
    if (def.scale === "125" && min !== undefined && max !== undefined) {
      return sequence125(min, max);
    }
    return undefined;
  }, [def.scale, min, max]);

  const unit = def.unit;
  const format = def.format ?? ((v: number) => formatSI(v, unit));
  const known = typeof value === "number";

  return (
    <ControlShell
      inputId={id}
      label={def.label}
      help={def.help}
      status={status}
      title={disabled ? disabledReason : undefined}
      path={path}
    >
      <NumericInput
        id={id}
        aria-label={def.label}
        value={known ? value : 0}
        onCommit={set}
        unit={unit}
        min={min}
        max={max}
        step={step}
        steps={steps}
        format={format}
        disabled={disabled || !known}
      />
    </ControlShell>
  );
}
