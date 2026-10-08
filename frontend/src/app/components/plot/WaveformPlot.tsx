import { useCallback, useMemo, useState } from "react";
import { de } from "../../../i18n/de";
import { cn } from "../ui/utils";
import { chooseAxisScale } from "./axisScale";
import { buildLayout } from "./buildLayout";
import { buildPlotData, GL_THRESHOLD } from "./buildPlotData";
import { CursorOverlay } from "./CursorOverlay";
import { CursorReadout } from "./CursorReadout";
import { resolveYMode } from "./displayTransform";
import { buildOverlayDecor } from "./overlayShapes";
import { MARGIN, scopeFrame, type Range } from "./plotGeometry";
import { Plot } from "./plotlyBundle";
import { PlotToolbar } from "./PlotToolbar";
import { ReadoutBar } from "./ReadoutBar";
import type { WaveformPlotProps } from "./types";
import { useCursors } from "./useCursors";
import { useElementSize } from "./useElementSize";
import { usePlotView } from "./usePlotView";
import { useRange } from "./useRangeStore";

const NO_OVERLAYS: NonNullable<WaveformPlotProps["overlays"]> = [];

/**
 * Oscilloscope-style waveform plot for the live page and the archive preview.
 * Draws any number of traces in scope divisions or volts, with a toolbar
 * (zoom/pan, autoscale, reset, cursors), a settings readout bar and cursor
 * readout. Zoom/pan persists across live frames while `viewKey` is unchanged;
 * changing `viewKey` remounts the plot with a fresh view.
 * @param props - See {@link WaveformPlotProps}
 * @returns The plot with toolbar and readouts
 */
export function WaveformPlot(props: WaveformPlotProps) {
  return <WaveformPlotView key={props.viewKey ?? "default"} {...props} />;
}

function WaveformPlotView({
  traces,
  overlays = NO_OVERLAYS,
  timebase,
  yMode,
  viewKey = "default",
  showReadouts = true,
  memoryDepth,
  toolbarExtras,
  emptyMessage = de.plot.empty,
  onPlotElement,
  className,
}: WaveformPlotProps) {
  const mode = resolveYMode(traces, yMode, !!timebase);
  const scaleSDiv = timebase?.scaleSDiv;
  const offsetS = timebase?.offsetS ?? 0;
  const frame = useMemo(
    () => scopeFrame(traces, scaleSDiv ? { scaleSDiv, offsetS, sampleRate: 0 } : undefined),
    [traces, scaleSDiv, offsetS],
  );
  const freqAxis = traces.length > 0 && traces.every((t) => t.xUnit === "Hz");
  const xScale = useMemo(
    () => chooseAxisScale([frame[0], frame[1]], freqAxis ? "Hz" : "s"),
    [frame, freqAxis],
  );
  const { setGraphDiv, ...view } = usePlotView(frame, traces, mode, xScale);
  const attachGraph = useCallback(
    (el: HTMLElement | null) => {
      setGraphDiv(el);
      onPlotElement?.(el);
    },
    [setGraphDiv, onPlotElement],
  );
  const cursors = useCursors();
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const { width, height } = useElementSize(wrap);
  const plotWidth = Math.max(0, width - MARGIN.l - MARGIN.r);
  const empty = traces.length === 0;
  const zoomed = view.committed !== null;

  const liveRange = useRange(view.store);
  const visible: Range = liveRange ?? view.committed ?? frame;

  const data = useMemo(
    () => buildPlotData(traces, { mode, window: view.committed ?? frame, plotWidth, xFactor: xScale.factor }),
    [traces, mode, view.committed, frame, plotWidth, xScale.factor],
  );
  const decor = useMemo(() => buildOverlayDecor(overlays, traces, mode, xScale.factor), [overlays, traces, mode, xScale.factor]);
  const layout = useMemo(
    () => buildLayout({
        mode,
        traces,
        frame,
        zoomed,
        dragMode: view.dragMode,
        decor,
        plotWidth,
        viewKey,
        xScale,
        fit: view.fit,
        fitSeq: view.fitSeq,
      }),
    [mode, traces, frame, zoomed, view.dragMode, decor, plotWidth, viewKey, xScale, view.fit, view.fitSeq],
  );
  const config = useMemo(
    () => ({
      displayModeBar: false,
      displaylogo: false,
      showTips: false,
      scrollZoom: !view.coarse,
      doubleClick: false as const,
      responsive: true,
      plotGlPixelRatio: 1,
    }),
    [view.coarse],
  );

  return (
    <div className={cn("@container flex min-h-0 flex-col gap-2", className)}>
      <PlotToolbar
        dragMode={view.dragMode}
        onDragMode={view.setDragMode}
        onAutoscale={view.autoscale}
        autoscaleOn={view.autoscaleOn}
        onReset={view.resetView}
        cursorsOn={cursors.enabled}
        onToggleCursors={() => cursors.toggle(visible)}
        disabled={empty}
        extras={toolbarExtras}
      />
      <div
        ref={setWrap}
        className="relative min-h-64 flex-1 overflow-hidden rounded border-2 border-(--lab-border) bg-white"
        data-gl={traces.some((t) => t.x.length > GL_THRESHOLD) || undefined}
      >
        <Plot
          ref={attachGraph}
          data={data}
          layout={layout}
          config={config}
          useResizeHandler
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          onRelayout={view.onRelayout}
          onRelayouting={view.onRelayouting}
          onDoubleClick={view.resetView}
        />
        {cursors.enabled && cursors.positions && !empty && width > 0 && (
          <CursorOverlay range={visible} positions={cursors.positions} width={width} height={height} onMove={cursors.move} />
        )}
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 p-4 text-center text-sm text-(--lab-text-secondary)">
            {emptyMessage}
          </div>
        )}
      </div>
      {cursors.enabled && cursors.positions && !empty && (
        <CursorReadout traces={traces} positions={cursors.positions} />
      )}
      {showReadouts && !empty && <ReadoutBar traces={traces} timebase={timebase} memoryDepth={memoryDepth} />}
    </div>
  );
}
