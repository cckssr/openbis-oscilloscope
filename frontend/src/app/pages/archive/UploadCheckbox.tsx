import { useEffect, useId, useRef } from "react";

interface UploadCheckboxProps {
  /** "all" ticked, "some" indeterminate, "none" empty, "disabled" greyed out. */
  state: "all" | "some" | "none" | "disabled";
  ariaLabel: string;
  /** Explains why the box is disabled (shown as tooltip on the whole hit area). */
  disabledReason?: string;
  /** Called with the value the box should take after the click. */
  onChange: (wanted: boolean) => void;
}

/**
 * Tri-state "Hochladen" checkbox with a ≥ 40 px hit area on touch devices.
 * @param props - See {@link UploadCheckboxProps}
 * @returns The checkbox inside a padded label
 */
export function UploadCheckbox({ state, ariaLabel, disabledReason, onChange }: UploadCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  const disabled = state === "disabled";
  return (
    <label
      htmlFor={id}
      title={disabled ? disabledReason : undefined}
      className={`inline-flex items-center justify-center p-2.5 coarse:p-3.5 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        id={id}
        ref={ref}
        type="checkbox"
        aria-label={ariaLabel}
        checked={state === "all"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4.5 cursor-[inherit] accent-(--lab-accent) coarse:size-5"
      />
    </label>
  );
}
