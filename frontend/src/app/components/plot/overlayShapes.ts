/** Turns scope overlays and per-channel ground markers into Plotly shapes/annotations. */
import type { Annotation, Shape } from "plotly.js";
import type { Overlay, Trace } from "../../../lib/trace";
import { toDisplay, type YMode } from "./displayTransform";

const TRIGGER_COLOR = "#d97706";
const NEUTRAL = "#6b7280";

export interface OverlayDecor {
  shapes: Partial<Shape>[];
  annotations: Partial<Annotation>[];
}

/**
 * Builds shapes and annotations for the overlays.
 * Trigger levels use the colour and scale of their trace; per-channel ground
 * markers (like the scope's "1▶") show where 0 V of each channel sits.
 * @param overlays - Overlays from the page
 * @param traces - Displayed traces (colour and scale lookup)
 * @param mode - Current y mode
 * @returns Shapes and annotations for the layout
 */
export function buildOverlayDecor(
  overlays: Overlay[],
  traces: Trace[],
  mode: YMode,
): OverlayDecor {
  const byId = new Map(traces.map((t) => [t.id, t]));
  const shapes: Partial<Shape>[] = [];
  const annotations: Partial<Annotation>[] = [];

  for (const o of overlays) {
    if (o.kind === "trigger-level") {
      const trace = byId.get(o.traceId);
      if (!trace) continue;
      const y = toDisplay(trace, mode, o.value);
      shapes.push({
        type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: y, y1: y,
        line: { color: trace.color, width: 1.2, dash: "dash" },
      });
      annotations.push({
        xref: "paper", yref: "y", x: 1, y, xanchor: "right", yanchor: "bottom",
        text: "T", showarrow: false, font: { size: 11, color: trace.color },
      });
    } else if (o.kind === "trigger-time") {
      shapes.push({
        type: "line", xref: "x", yref: "paper", x0: o.value, x1: o.value, y0: 0, y1: 1,
        line: { color: TRIGGER_COLOR, width: 1.2, dash: "dash" },
      });
      annotations.push({
        xref: "x", yref: "paper", x: o.value, y: 1, xanchor: "left", yanchor: "top",
        text: "T", showarrow: false, font: { size: 11, color: TRIGGER_COLOR },
      });
    } else if (o.kind === "cursor-x") {
      shapes.push({
        type: "line", xref: "x", yref: "paper", x0: o.value, x1: o.value, y0: 0, y1: 1,
        line: { color: o.color ?? NEUTRAL, width: 1, dash: "dot" },
      });
    } else if (o.kind === "cursor-y") {
      const trace = byId.get(o.traceId);
      const y = trace ? toDisplay(trace, mode, o.value) : o.value;
      shapes.push({
        type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: y, y1: y,
        line: { color: o.color ?? trace?.color ?? NEUTRAL, width: 1, dash: "dot" },
      });
    } else if (o.kind === "marker") {
      const trace = o.traceId ? byId.get(o.traceId) : undefined;
      annotations.push({
        xref: "x", yref: "y", x: o.x, y: trace ? toDisplay(trace, mode, o.y) : o.y,
        text: o.label, showarrow: true, arrowhead: 2, ax: 0, ay: -26,
        font: { size: 11, color: trace?.color ?? NEUTRAL }, arrowcolor: trace?.color ?? NEUTRAL,
      });
    }
  }

  if (mode === "divisions") {
    for (const t of traces) {
      if (!t.scale) continue;
      annotations.push({
        xref: "paper", yref: "y", x: 0, y: t.scale.offset / t.scale.perDiv,
        xanchor: "left", yanchor: "middle", showarrow: false,
        text: `${t.channel ?? t.label}▶`, font: { size: 10, color: t.color },
      });
    }
  }
  return { shapes, annotations };
}
