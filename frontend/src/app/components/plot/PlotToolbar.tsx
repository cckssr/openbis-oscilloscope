import type { ReactNode } from "react";
import { Hand, Maximize2, RotateCcw, Ruler, ZoomIn } from "lucide-react";
import { de } from "../../../i18n/de";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

const t = de.plot.toolbar;

interface PlotToolbarProps {
  dragMode: "zoom" | "pan";
  onDragMode: (mode: "zoom" | "pan") => void;
  onAutoscale: () => void;
  onReset: () => void;
  cursorsOn: boolean;
  onToggleCursors: () => void;
  /** Disables everything while there is no data. */
  disabled?: boolean;
  extras?: ReactNode;
}

interface ToolProps {
  icon: ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}

function Tool({ icon, label, hint, onClick, pressed, disabled }: ToolProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      title={disabled ? t.disabledHint : hint}
      disabled={disabled}
      className={cn(pressed && "border-(--lab-accent) bg-(--lab-accent)/10 text-(--lab-accent) hover:bg-(--lab-accent)/15")}
    >
      {icon}
      <span className="hidden @xl:inline">{label}</span>
    </Button>
  );
}

/**
 * Own plot toolbar (the Plotly modebar is hidden): zoom/pan toggle, autoscale,
 * reset, cursors, then page-provided extras such as the export menu. Labels
 * collapse to icons on narrow containers; every button keeps its aria-label.
 * @param props - See {@link PlotToolbarProps}
 * @returns The toolbar
 */
export function PlotToolbar({
  dragMode,
  onDragMode,
  onAutoscale,
  onReset,
  cursorsOn,
  onToggleCursors,
  disabled,
  extras,
}: PlotToolbarProps) {
  return (
    <div role="toolbar" aria-label={t.group} className="flex shrink-0 flex-wrap items-center gap-1.5">
      <div className="inline-flex gap-1" role="group">
        <Tool icon={<ZoomIn />} label={t.zoom} hint={t.zoomHint} pressed={dragMode === "zoom"} disabled={disabled} onClick={() => onDragMode("zoom")} />
        <Tool icon={<Hand />} label={t.pan} hint={t.panHint} pressed={dragMode === "pan"} disabled={disabled} onClick={() => onDragMode("pan")} />
      </div>
      <Tool icon={<Maximize2 />} label={t.autoscale} hint={t.autoscaleHint} disabled={disabled} onClick={onAutoscale} />
      <Tool icon={<RotateCcw />} label={t.reset} hint={t.resetHint} disabled={disabled} onClick={onReset} />
      <Tool icon={<Ruler />} label={t.cursors} hint={t.cursorsHint} pressed={cursorsOn} disabled={disabled} onClick={onToggleCursors} />
      {extras && <div className="ml-auto flex items-center gap-1.5">{extras}</div>}
    </div>
  );
}
