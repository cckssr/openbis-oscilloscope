import { useCallback, useMemo, useState } from "react";
import type { AxisScale } from "./axisScale";
import { Plotly } from "./plotlyBundle";
import { toDisplayArray, type YMode } from "./displayTransform";
import { RangeStore } from "./useRangeStore";
import { dataExtent, sameRange, yExtent, type Range } from "./plotGeometry";
import type { Trace } from "../../../lib/trace";
import { useMediaQuery } from "./useMediaQuery";

interface RelayoutEvent {
  [key: string]: unknown;
}

function readXRange(e: RelayoutEvent): Range | "auto" | null {
  if (e["xaxis.autorange"] === true) return "auto";
  const a = e["xaxis.range[0]"];
  const b = e["xaxis.range[1]"];
  if (typeof a === "number" && typeof b === "number") return [a, b];
  const pair = e["xaxis.range"];
  if (Array.isArray(pair) && typeof pair[0] === "number" && typeof pair[1] === "number") {
    return [pair[0], pair[1]];
  }
  return null;
}

/**
 * Owns the interactive view state of the plot: committed x range (drives
 * re-decimation), live range (drives the cursor overlay), drag mode and the
 * reset/autoscale actions. Zoom/pan itself lives in Plotly (`uirevision`).
 * @param frame - Default x range (scope screen)
 * @param traces - Displayed traces (for autoscale)
 * @param mode - Current y mode
 * @param xScale - x axis prefix: Plotly sees x divided by `xScale.factor`; state and callers use base units
 * @returns State, event handlers and actions
 */
export function usePlotView(frame: Range, traces: Trace[], mode: YMode, xScale: AxisScale) {
  const factor = xScale.factor;
  const coarse = useMediaQuery("(pointer: coarse)");
  const [dragMode, setDragMode] = useState<"zoom" | "pan">(coarse ? "pan" : "zoom");
  const [committed, setCommitted] = useState<Range | null>(null);
  const store = useMemo(() => new RangeStore(), []);
  const [graphDiv, setGraphDiv] = useState<HTMLElement | null>(null);

  const frameLo = frame[0];
  const frameHi = frame[1];

  const resetView = useCallback(() => {
    const gd = graphDiv;
    if (!gd) return;
    const update: Record<string, unknown> = { "xaxis.range": [frameLo / factor, frameHi / factor] };
    if (mode === "divisions") update["yaxis.range"] = [-4, 4];
    else update["yaxis.autorange"] = true;
    void Plotly.relayout(gd as never, update as never);
  }, [graphDiv, frameLo, frameHi, mode, factor]);

  const autoscale = useCallback(() => {
    const gd = graphDiv;
    if (!gd) return;
    const extent = dataExtent(traces);
    const update: Record<string, unknown> = {};
    if (extent && extent[1] > extent[0]) update["xaxis.range"] = [extent[0] / factor, extent[1] / factor];
    if (mode === "divisions") {
      const y = yExtent(traces.map((t) => toDisplayArray(t, mode, t.y)));
      if (y) update["yaxis.range"] = y;
    } else {
      update["yaxis.autorange"] = true;
    }
    void Plotly.relayout(gd as never, update as never);
  }, [graphDiv, traces, mode, factor]);

  const onRelayout = useCallback(
    (e: RelayoutEvent) => {
      const raw = readXRange(e);
      if (raw === "auto") {
        resetView();
        return;
      }
      if (!raw) return;
      const x: Range = [raw[0] * factor, raw[1] * factor];
      const atFrame = sameRange(x, [frameLo, frameHi]);
      store.set(atFrame ? null : x);
      setCommitted(atFrame ? null : x);
    },
    [resetView, store, frameLo, frameHi, factor],
  );

  const onRelayouting = useCallback(
    (e: RelayoutEvent) => {
      const x = readXRange(e);
      if (x && x !== "auto") store.set([x[0] * factor, x[1] * factor]);
    },
    [store, factor],
  );

  return {
    coarse,
    dragMode,
    setDragMode,
    committed,
    store,
    setGraphDiv,
    onRelayout,
    onRelayouting,
    resetView,
    autoscale,
  };
}
