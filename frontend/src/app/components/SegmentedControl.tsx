import { useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "./ui/utils";

/** One choice of a {@link SegmentedControl}. */
export interface SegmentedOption {
  value: string;
  label: string;
  /** Short explanation; shown as tooltip and, for the selected option, as a visible help line. */
  help?: string;
}

export interface SegmentedControlProps {
  /** Choices; plain strings are used as both value and label. */
  options: (string | SegmentedOption)[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Always render as dropdown (also happens automatically with more than 3 options). */
  asSelect?: boolean;
  "aria-label"?: string;
  id?: string;
  className?: string;
}

/** Above this many options the control becomes a dropdown. */
const MAX_SEGMENTS = 3;

const normalise = (o: string | SegmentedOption): SegmentedOption =>
  typeof o === "string" ? { value: o, label: o } : o;

/**
 * Single-choice control. Up to 3 options render as wrapping toggle buttons
 * (radiogroup with arrow-key navigation, ≥ 40 px tall on touch); more options
 * or `asSelect` render a native-feeling dropdown.
 *
 * @param props - See {@link SegmentedControlProps}
 * @returns The control
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  disabled = false,
  asSelect = false,
  "aria-label": ariaLabel,
  id,
  className,
}: SegmentedControlProps) {
  const items = options.map(normalise);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  if (asSelect || items.length > MAX_SEGMENTS) {
    return (
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          aria-label={ariaLabel}
          className={cn("coarse:data-[size=default]:h-11 coarse:text-base", className)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value} className="coarse:min-h-11">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const selectedIndex = items.findIndex((o) => o.value === value);
  const focusable = selectedIndex >= 0 ? selectedIndex : 0;
  const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined;

  const move = (from: number, direction: 1 | -1) => {
    const next = (from + direction + items.length) % items.length;
    onChange(items[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        id={id}
        role="radiogroup"
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        className="flex flex-wrap gap-1"
      >
        {items.map((o, i) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              tabIndex={i === focusable ? 0 : -1}
              title={o.help}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, -1);
                }
              }}
              className={cn(
                "min-h-8 flex-1 rounded border-2 px-3 py-1 text-xs font-medium transition-colors coarse:min-h-11 coarse:text-sm",
                "outline-none focus-visible:ring-2 focus-visible:ring-(--lab-accent)/40",
                "disabled:cursor-not-allowed disabled:border-(--lab-border) disabled:bg-(--lab-disabled-bg) disabled:text-(--lab-disabled-text)",
                active
                  ? "border-(--lab-accent) bg-(--lab-accent) text-white disabled:bg-(--lab-border) disabled:text-white"
                  : "border-(--lab-border) bg-white text-(--lab-text-secondary) hover:bg-(--lab-panel) hover:text-(--lab-text-primary)",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {selected?.help && <p className="help-text">{selected.help}</p>}
    </div>
  );
}
