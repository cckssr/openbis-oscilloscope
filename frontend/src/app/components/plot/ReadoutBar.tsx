import { de } from "../../../i18n/de";
import { formatPerDiv, formatPoints, formatSI } from "../../../lib/units";
import { sampleRateOf, type Timebase, type Trace } from "../../../lib/trace";

const t = de.plot.readout;

interface ReadoutBarProps {
  traces: Trace[];
  timebase?: Timebase;
  /** Samples per channel. */
  memoryDepth?: number;
}

function Chip({ children, color, label }: { children: React.ReactNode; color?: string; label?: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded border border-(--lab-border) bg-white px-2 py-1">
      {color && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />}
      {label && <span className="font-semibold">{label}</span>}
      <span>{children}</span>
    </li>
  );
}

/**
 * Settings readout under the plot (outside the plot area): per-channel scale,
 * coupling and probe, timebase, sample rate and memory depth. Wraps on narrow widths.
 * @param props - See {@link ReadoutBarProps}
 * @returns The readout list
 */
export function ReadoutBar({ traces, timebase, memoryDepth }: ReadoutBarProps) {
  const timeTrace = traces.find((tr) => tr.xUnit === "s");
  const rate = timebase && timebase.sampleRate > 0 ? timebase.sampleRate : timeTrace ? sampleRateOf(timeTrace) : 0;
  return (
    <ul aria-label={t.label} className="flex shrink-0 flex-wrap gap-1.5 font-mono text-xs tabular-nums text-(--lab-text-primary)">
      {traces.map((tr) =>
        tr.scale ? (
          <Chip key={tr.id} color={tr.color} label={tr.label}>
            {t.perDiv(
              formatPerDiv(tr.scale.perDiv, tr.yUnit),
              tr.coupling,
              tr.probe ? `${tr.probe.toLocaleString("de-DE")}×` : undefined,
            )}
          </Chip>
        ) : (
          <Chip key={tr.id} color={tr.color}>
            <span className="font-semibold">{tr.label}</span>
          </Chip>
        ),
      )}
      {timebase && timebase.scaleSDiv > 0 && <Chip label={t.timebase}>{formatPerDiv(timebase.scaleSDiv, "s")}</Chip>}
      {rate > 0 && <Chip label={t.sampleRate}>{formatSI(rate, "Sa/s")}</Chip>}
      {memoryDepth !== undefined && memoryDepth > 0 && <Chip label={t.memoryDepth}>{formatPoints(memoryDepth)}</Chip>}
    </ul>
  );
}
