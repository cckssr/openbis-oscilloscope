import { SlidersHorizontal } from "lucide-react";
import { de } from "../../../i18n/de";
import type { Analysis } from "../../../lib/analysis/types";
import type { Trace } from "../../../lib/trace";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const t = de.plot.measurements;

interface MeasurementPickerProps {
  /** Analyses offered at the current level. */
  analyses: Analysis[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Candidates for the phase reference; the picker is shown when phase is offered. */
  traces: Trace[];
  referenceId: string;
  onReferenceChange: (id: string) => void;
}

/**
 * "Messwerte wählen" popover: checkboxes for the available measurements and,
 * for the phase, the reference channel. Works on tap (no hover needed).
 * @param props - See {@link MeasurementPickerProps}
 * @returns The popover trigger button with its content
 */
export function MeasurementPicker({ analyses, selected, onChange, traces, referenceId, onReferenceChange }: MeasurementPickerProps) {
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...selected, id] : selected.filter((s) => s !== id));
  const hasPhase = analyses.some((a) => a.inputs.traces === 2);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <SlidersHorizontal aria-hidden /> {t.choose}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="mb-2 text-xs text-(--lab-text-secondary)">{t.chooseHint}</p>
        <ul className="flex flex-col">
          {analyses.map((a) => (
            <li key={a.id}>
              <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm coarse:min-h-11">
                <Checkbox checked={selected.includes(a.id)} onCheckedChange={(c) => toggle(a.id, c === true)} />
                {a.label}
              </label>
            </li>
          ))}
        </ul>
        {hasPhase && traces.length >= 2 && (
          <div className="mt-3 border-t border-(--lab-border) pt-3">
            <span className="mb-1 block text-xs font-medium">{t.reference}</span>
            <Select value={referenceId} onValueChange={onReferenceChange}>
              <SelectTrigger aria-label={t.reference}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {traces.map((tr) => (
                  <SelectItem key={tr.id} value={tr.id}>
                    {tr.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-(--lab-text-secondary)">{t.phaseHint}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
