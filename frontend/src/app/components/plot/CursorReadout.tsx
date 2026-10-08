import { de } from "../../../i18n/de";
import { formatSI } from "../../../lib/units";
import type { Trace } from "../../../lib/trace";
import { formatTraceValue } from "./formatValue";
import { valueAt } from "./cursorMath";
import type { CursorPair } from "./useCursors";

const t = de.plot.cursor;

/**
 * Readout of the two cursors: times, Δt, 1/Δt and every trace's value at both.
 * @param props - Traces and cursor positions
 * @returns The readout panel
 */
export function CursorReadout({ traces, positions }: { traces: Trace[]; positions: CursorPair }) {
  const [t1, t2] = positions;
  const dt = t2 - t1;
  const freq = traces.some((tr) => tr.xUnit === "Hz");
  const xUnit = freq ? "Hz" : "s";
  return (
    <div
      role="group"
      aria-label={t.label}
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 rounded border border-(--lab-border) bg-(--lab-panel) px-3 py-1.5 font-mono text-xs tabular-nums"
    >
      <span>{t.t1} = {formatSI(t1, xUnit)}</span>
      <span>{t.t2} = {formatSI(t2, xUnit)}</span>
      <span className="font-semibold">{t.dt} = {formatSI(dt, xUnit)}</span>
      {!freq && Math.abs(dt) > 0 && <span>{t.freq} = {formatSI(1 / Math.abs(dt), "Hz")}</span>}
      {traces.map((tr) => {
        const v1 = valueAt(tr, t1);
        const v2 = valueAt(tr, t2);
        const unit = tr.yUnit;
        return (
          <span key={tr.id} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: tr.color }} />
            <span className="font-semibold">{tr.label}</span>
            {formatTraceValue(v1, unit)} → {formatTraceValue(v2, unit)} ({t.dv} = {formatTraceValue(v2 - v1, unit === "dBV" ? "dBV" : unit)})
          </span>
        );
      })}
    </div>
  );
}
