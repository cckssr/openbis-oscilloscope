import { useMemo, useState } from "react";
import { de } from "../../../i18n/de";
import "../../../lib/analysis/builtins";
import { isMeasurable } from "../../../lib/analysis/compute";
import { formatMeasurement } from "../../../lib/analysis/format";
import { listAnalyses } from "../../../lib/analysis/registry";
import { useMeasurements } from "../../../lib/analysis/useMeasurements";
import type { Trace } from "../../../lib/trace";
import { cn } from "../ui/utils";
import { MeasurementPicker } from "./MeasurementPicker";
import { usePersistentList } from "./usePersistentList";

const t = de.plot.measurements;

/** Measurements shown until the user chooses otherwise. */
const DEFAULT_IDS = ["vpp", "frequency", "rms"];

interface MeasurementTableProps {
  traces: Trace[];
  /** "expert" adds Anstiegszeit, Phase and more. */
  level: "basic" | "expert";
  className?: string;
}

/**
 * Compact measurement table under the plot: one row per channel (colour chip),
 * one column per chosen measurement; phase is a column relative to a reference
 * channel in the expert level. The selection is remembered in localStorage.
 * Values are computed in a Web Worker; "—" means not computable.
 * @param props - See {@link MeasurementTableProps}
 * @returns The table with its "Messwerte wählen" popover
 */
export function MeasurementTable({
  traces,
  level,
  className,
}: MeasurementTableProps) {
  const measurable = useMemo(() => traces.filter(isMeasurable), [traces]);
  const offered = useMemo(
    () =>
      listAnalyses(level).filter(
        (a) =>
          a.output !== "traces" &&
          (a.inputs.traces === 1 || measurable.length >= 2),
      ),
    [level, measurable.length],
  );
  const [stored, setStored] = usePersistentList(
    "lab.measurements.v1",
    DEFAULT_IDS,
  );
  const [refChoice, setRefChoice] = useState("");

  const selected = stored.filter((id) => offered.some((a) => a.id === id));
  const referenceId = measurable.some((tr) => tr.id === refChoice)
    ? refChoice
    : (measurable[0]?.id ?? "");
  const { get, computing } = useMeasurements(measurable, selected, {
    referenceTraceId: referenceId,
  });
  const columns = offered.filter((a) => selected.includes(a.id));

  return (
    <section
      className={cn("flex flex-col gap-2", className)}
      aria-label={t.title}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-(--lab-text-primary)">
          {t.title}
          {computing && (
            <span className="ml-2 text-xs font-normal text-(--lab-text-secondary)">
              {t.computing}
            </span>
          )}
        </h3>
        <MeasurementPicker
          analyses={offered}
          selected={selected}
          onChange={setStored}
          traces={measurable}
          referenceId={referenceId}
          onReferenceChange={setRefChoice}
        />
      </div>
      {measurable.length === 0 ? (
        <p className="text-sm text-(--lab-text-secondary)">{t.noTraces}</p>
      ) : (
        <div className="overflow-x-auto rounded border border-(--lab-border)">
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead>
              <tr className="bg-(--lab-panel) text-left text-xs text-(--lab-text-secondary)">
                <th
                  scope="col"
                  className="sticky left-0 bg-(--lab-panel) px-3 py-1.5 font-medium"
                >
                  {t.channel}
                </th>
                {columns.map((a) => (
                  <th
                    key={a.id}
                    scope="col"
                    className="px-3 py-1.5 text-right font-medium whitespace-nowrap"
                  >
                    {a.inputs.traces === 2 ? t.phaseOf(referenceId) : a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {measurable.map((tr) => (
                <tr key={tr.id} className="border-t border-(--lab-border)">
                  <th
                    scope="row"
                    className="sticky left-0 bg-white px-3 py-1.5 text-left font-medium whitespace-nowrap"
                  >
                    <span
                      aria-hidden
                      className="mr-2 inline-block size-2.5 rounded-full align-middle"
                      style={{ background: tr.color }}
                    />
                    {tr.label}
                  </th>
                  {columns.map((a) => {
                    const isRef =
                      a.inputs.traces === 2 && tr.id === referenceId;
                    const m = get(tr.id, a.id);
                    return (
                      <td
                        key={a.id}
                        className="px-3 py-1.5 text-right font-mono whitespace-nowrap"
                        title={
                          m && !Number.isFinite(m.value)
                            ? t.notComputable
                            : undefined
                        }
                      >
                        {isRef ? "—" : formatMeasurement(m)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
