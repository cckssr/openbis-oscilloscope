import { useRef } from "react";
import { de } from "../../../i18n/de";
import type { CursorPair } from "./useCursors";
import { MARGIN, type Range } from "./plotGeometry";

const t = de.plot.cursor;

interface CursorOverlayProps {
  /** Currently visible x range. */
  range: Range;
  positions: CursorPair;
  /** Size of the plot container in px. */
  width: number;
  height: number;
  onMove: (index: 0 | 1, x: number) => void;
}

/**
 * Two draggable vertical cursors drawn as an HTML layer over the plot area.
 * Drag handles are wide (36 px, 44 px on touch) so they work with fingers;
 * everything else lets pointer events through to Plotly for zoom/pan.
 * @param props - See {@link CursorOverlayProps}
 * @returns The overlay
 */
export function CursorOverlay({ range, positions, width, height, onMove }: CursorOverlayProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const plotW = Math.max(1, width - MARGIN.l - MARGIN.r);
  const plotH = Math.max(1, height - MARGIN.t - MARGIN.b);
  const span = range[1] - range[0] || 1;

  const toX = (value: number) => ((value - range[0]) / span) * plotW;

  const startDrag = (index: 0 | 1) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const move = (ev: PointerEvent) => {
      const frac = (ev.clientX - rect.left - MARGIN.l) / plotW;
      onMove(index, range[0] + Math.min(1, Math.max(0, frac)) * span);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={false}>
      <div className="absolute overflow-hidden" style={{ left: MARGIN.l, top: MARGIN.t, width: plotW, height: plotH }}>
        {positions.map((pos, i) => {
          const x = toX(pos);
          if (x < -20 || x > plotW + 20) return null;
          const index = i as 0 | 1;
          return (
            <div
              key={index}
              role="slider"
              tabIndex={0}
              aria-label={t.handle(index + 1)}
              aria-valuenow={pos}
              onPointerDown={startDrag(index)}
              className="pointer-events-auto absolute top-0 h-full w-9 -translate-x-1/2 cursor-col-resize touch-none outline-none focus-visible:bg-(--lab-accent)/10 coarse:w-11"
              style={{ left: x }}
            >
              <div
                className="absolute top-0 left-1/2 h-full -translate-x-1/2 border-l-2 border-slate-700"
                style={{ borderLeftStyle: index === 0 ? "solid" : "dashed" }}
              />
              <span className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b bg-slate-700 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                {index + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
