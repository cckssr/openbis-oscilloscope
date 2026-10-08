/** Plotly layout of the waveform plot (axes, grid, margins, interaction mode). */
import type { Layout } from "plotly.js";
import { de } from "../../../i18n/de";
import type { Trace } from "../../../lib/trace";
import type { OverlayDecor } from "./overlayShapes";
import type { YMode } from "./displayTransform";
import type { AxisScale } from "./axisScale";
import { MARGIN, X_DIVISIONS, Y_DIVISIONS, type Range } from "./plotGeometry";

const t = de.plot.axis;

const GRID = "#e5e7eb";
const MINOR_GRID = "#f3f4f6";
const TEXT = "#4b5563";
/** d3 format: SI prefix, up to 6 significant digits, trailing zeros trimmed ("1ms", "200mV"). */
const SI_FORMAT = ".6~s";
/** d3 format for already-scaled x values: plain number, zeros trimmed ("2,5"). */
const SCALED_FORMAT = ".8~f";

export interface LayoutOptions {
  mode: YMode;
  traces: Trace[];
  /** Default (scope screen) x range. */
  frame: Range;
  /** True when the user zoomed or panned away from the frame. */
  zoomed: boolean;
  dragMode: "zoom" | "pan";
  decor: OverlayDecor;
  /** Plot area width in px, to thin out tick labels on narrow screens. */
  plotWidth: number;
  /** Zoom/pan state key (`uirevision`). */
  viewKey: string;
  /** x axis prefix; x ranges and ticks are in scaled units. */
  xScale: AxisScale;
  /** "Achsen anpassen" is on: axes follow the data of every frame. */
  fit?: { x: Range; y?: Range } | null;
  /** Counter of "Achsen anpassen" clicks; a new value drops earlier zoom/pan (`uirevision`). */
  fitSeq?: number;
}

function yTitle(
  traces: Trace[],
  mode: YMode,
): { title: string; suffix: string } {
  if (mode === "divisions") return { title: t.divisions, suffix: "" };
  const units = new Set(traces.map((tr) => tr.yUnit));
  if (units.size === 1 && units.has("dBV"))
    return { title: t.level, suffix: "" };
  if (units.size === 1 && units.has("A"))
    return { title: t.current, suffix: "A" };
  return { title: t.voltage, suffix: "V" };
}

/**
 * Builds the layout. Axis ranges are only applied on a new `viewKey`; between
 * live frames Plotly keeps the user's zoom (`uirevision`).
 * @param o - See {@link LayoutOptions}
 * @returns A fresh layout object (Plotly stores and mutates the one it is given)
 */
export function buildLayout(o: LayoutOptions): Partial<Layout> {
  const {
    mode,
    traces,
    frame,
    zoomed,
    dragMode,
    decor,
    plotWidth,
    viewKey,
    xScale,
    fit,
    fitSeq = 0,
  } = o;
  const freq = traces.length > 0 && traces.every((tr) => tr.xUnit === "Hz");
  const { title: yAxisTitle, suffix: ySuffix } = yTitle(traces, mode);

  // Scope grid: one gridline per division, thinned on narrow plots.
  const f = xScale.factor;
  const divWidth = (frame[1] - frame[0]) / f / X_DIVISIONS;
  const pxPerDiv = plotWidth / X_DIVISIONS;
  const step = pxPerDiv >= 56 ? 1 : pxPerDiv >= 28 ? 2 : 5;
  const scopeGrid = !zoomed && !freq;

  return {
    autosize: true,
    margin: { l: MARGIN.l, r: MARGIN.r, t: MARGIN.t, b: MARGIN.b },
    paper_bgcolor: "white",
    plot_bgcolor: "white",
    font: { family: "Inter, system-ui, sans-serif", size: 11, color: TEXT },
    separators: ",.",
    showlegend: false,
    hovermode: "x unified",
    hoverlabel: { font: { family: "JetBrains Mono, monospace", size: 11 } },
    dragmode: dragMode,
    // A different prefix means different axis numbers, so a kept zoom would be wrong.
    uirevision: `${viewKey}|${xScale.prefix}|${fitSeq}`,
    shapes: decor.shapes,
    annotations: decor.annotations,
    xaxis: {
      // Copy: Plotly writes the user's zoom into the arrays it is given.
      range: fit ? [fit.x[0] / f, fit.x[1] / f] : [frame[0] / f, frame[1] / f],
      title: {
        text: freq ? t.frequency : t.time,
        standoff: 6,
        font: { size: 12 },
      },
      ticksuffix: xScale.suffix,
      tickformat: SCALED_FORMAT,
      hoverformat: ".5~f",
      tickmode: scopeGrid ? "linear" : "auto",
      tick0: frame[0] / f,
      dtick: divWidth * step,
      nticks: Math.max(3, Math.round(plotWidth / 90)),
      minor:
        scopeGrid && step > 1
          ? { dtick: divWidth, showgrid: true, gridcolor: MINOR_GRID }
          : undefined,
      gridcolor: GRID,
      zeroline: false,
      showline: true,
      linecolor: "#9ca3af",
      mirror: true,
      automargin: false,
    },
    yaxis: {
      ...(mode === "divisions"
        ? {
            range: fit?.y
              ? [fit.y[0], fit.y[1]]
              : [-Y_DIVISIONS / 2, Y_DIVISIONS / 2],
            tickmode: "linear",
            tick0: -Y_DIVISIONS / 2,
            dtick: 1,
          }
        : { autorange: true, nticks: 9 }),
      title: { text: yAxisTitle, standoff: 4, font: { size: 12 } },
      ticksuffix: ySuffix,
      tickformat: mode === "divisions" ? undefined : SI_FORMAT,
      gridcolor: GRID,
      zeroline: true,
      zerolinecolor: "#9ca3af",
      zerolinewidth: 1,
      showline: true,
      linecolor: "#9ca3af",
      mirror: true,
      automargin: false,
    },
  } as Partial<Layout>;
}
