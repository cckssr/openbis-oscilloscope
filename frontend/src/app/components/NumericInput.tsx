import { useId, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import { de } from "../../i18n/de";
import {
  evaluateText,
  formatPlain,
  parseNumericText,
  stepValue,
} from "./common/numericParsing";

const t = de.common.numeric;

export interface NumericInputProps {
  /** Current (applied) value; may change from outside while the field is not being edited. */
  value: number;
  /** Called only with a valid, range-checked, rounded value (blur, Enter, ± buttons, arrow keys). */
  onCommit?: (value: number) => void;
  /** @deprecated Alias of `onCommit`, kept until all callers are migrated. */
  onChange?: (value: number) => void;
  /** Unit used for parsing (`"V"`, `"V/div"`) and, unless `format` is set, shown after the field. */
  unit?: string;
  min?: number;
  max?: number;
  /** Linear step for ± and arrow keys (default 0.1). Ignored when `steps` is given. */
  step?: number;
  /** Ascending allowed values (1-2-5 knob); ± moves to the neighbouring entry. */
  steps?: number[];
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
  /**
   * Display formatter, e.g. `(v) => formatPerDiv(v, "V")`. Its output replaces the
   * plain German number and is expected to include the unit, so the unit
   * adornment is hidden unless `showUnit` is set.
   */
  format?: (value: number) => string;
  /** Show `unit` after the field (default: only when no `format` is given). */
  showUnit?: boolean;
}

/**
 * Numeric field for scope settings. Keeps a string draft while typing, then
 * parses and validates on blur/Enter (accepts `-`, `,`/`.`, SI suffixes like
 * `200m` and a unit suffix). Escape reverts, Arrow keys and the large ± buttons
 * step linearly or along a 1-2-5 sequence. External `value` changes are shown
 * unless the user is editing, so live sync never clobbers a draft.
 *
 * @param props - See {@link NumericInputProps}
 * @returns The field with steppers and an inline validation message
 */
export function NumericInput({
  value,
  onCommit,
  onChange,
  unit = "",
  min,
  max,
  step = 0.1,
  steps,
  disabled = false,
  id,
  "aria-label": ariaLabel,
  className,
  format,
  showUnit,
}: NumericInputProps) {
  const errorId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [seenValue, setSeenValue] = useState(value);

  // Live sync: when the value changes from outside, drop stale drafts unless the user is typing.
  if (value !== seenValue) {
    setSeenValue(value);
    if (!focused) {
      setDraft(null);
      setError(null);
    }
  }

  const emit = onCommit ?? onChange;
  const formatValue = format ?? formatPlain;
  const unitShown = (showUnit ?? !format) && unit !== "";
  const formatBound = (bound: number) =>
    unitShown ? `${formatValue(bound)} ${unit}` : formatValue(bound);

  const sequence = useMemo(
    () =>
      steps?.filter(
        (v) =>
          (min === undefined || v >= min * 0.9999) &&
          (max === undefined || v <= max * 1.0001),
      ),
    [steps, min, max],
  );
  const stepOpts = { step, sequence, min, max };

  /** Base for stepping: the valid draft if there is one, else the applied value. */
  const baseValue = (): number => {
    if (draft === null) return value;
    const parsed = parseNumericText(draft, unit);
    return parsed ?? value;
  };

  const commitText = (text: string) => {
    const result = evaluateText(text, { unit, min, max, formatBound });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDraft(null);
    setError(null);
    if (result.value !== value) emit?.(result.value);
  };

  const stepBy = (direction: 1 | -1) => {
    if (disabled) return;
    const base = baseValue();
    const next = stepValue(base, direction, stepOpts);
    setDraft(null);
    setError(null);
    if (next !== value) emit?.(next);
  };

  const base = baseValue();
  const canStep = (direction: 1 | -1) => {
    if (disabled) return false;
    const next = stepValue(base, direction, stepOpts);
    return direction > 0 ? next > base : next < base;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (draft !== null) commitText(draft);
    } else if (e.key === "Escape") {
      if (draft !== null || error) {
        e.preventDefault();
        e.stopPropagation();
        setDraft(null);
        setError(null);
      }
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      stepBy(e.key === "ArrowUp" ? 1 : -1);
    }
  };

  const label = ariaLabel ?? "Wert";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-stretch gap-1">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-8 coarse:size-11"
          aria-label={`${label} ${t.decrease}`}
          disabled={!canStep(-1)}
          onClick={() => stepBy(-1)}
        >
          <Minus />
        </Button>
        <div
          className={cn(
            "flex min-h-8 min-w-0 flex-1 items-center rounded border-2 bg-white px-2 coarse:min-h-11",
            "focus-within:border-(--lab-accent) focus-within:ring-2 focus-within:ring-(--lab-accent)/30",
            error ? "border-(--lab-danger)" : "border-(--lab-border)",
            disabled && "bg-(--lab-disabled-bg) text-(--lab-disabled-text)",
          )}
        >
          <input
            id={id}
            type="text"
            inputMode="text"
            enterKeyHint="done"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            value={draft ?? formatValue(value)}
            onFocus={(e) => {
              setFocused(true);
              e.currentTarget.select();
            }}
            onBlur={() => {
              setFocused(false);
              if (draft !== null) commitText(draft);
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 bg-transparent py-1 font-mono text-sm outline-none coarse:text-base"
          />
          {unitShown && (
            <span className="ml-1 shrink-0 text-xs text-(--lab-text-secondary) coarse:text-sm">
              {unit}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-8 coarse:size-11"
          aria-label={`${label} ${t.increase}`}
          disabled={!canStep(1)}
          onClick={() => stepBy(1)}
        >
          <Plus />
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="help-text text-(--lab-danger)">
          {error}
        </p>
      )}
    </div>
  );
}
