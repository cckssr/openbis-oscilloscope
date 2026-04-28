import PlotlyReact from "react-plotly.js";
// react-plotly.js ships CJS; under Vite's ESM transform the component may land
// on `.default` depending on how the bundle is pre-optimised.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = ((PlotlyReact as any).default ??
  PlotlyReact) as typeof PlotlyReact;
import type { Layout, Shape, Data } from "plotly.js";

interface WaveformPlotProps {
  data: Array<{
    time: number;
    ch1?: number;
    ch2?: number;
    ch3?: number;
    ch4?: number;
  }>;
  enabledChannels: {
    ch1: boolean;
    ch2: boolean;
    ch3: boolean;
    ch4: boolean;
  };
  channelScales?: Record<number, number>;
  triggerLevel?: number;
  triggerTime?: number;
  timebase: string;
  sampleRate: string;
  timebaseScaleSDiv: number;
}

const NUM_X_DIVS = 10;
const NUM_Y_DIVS = 8;

const CHANNEL_COLORS = ["#FACC15", "#00BFFF", "#FF6B6B", "#7CFC00"];

function formatTimeLabel(s: number): string {
  const abs = Math.abs(s);
  if (abs === 0) return "0";
  if (abs < 1e-6) return `${(s * 1e9).toFixed(0)}n`;
  if (abs < 1e-3) return `${(s * 1e6).toFixed(0)}µ`;
  if (abs < 1) return `${(s * 1e3).toFixed(0)}m`;
  return `${s.toFixed(2)}`;
}

export function WaveformPlot({
  data,
  enabledChannels,
  channelScales,
  triggerLevel,
  triggerTime,
  timebase,
  sampleRate,
  timebaseScaleSDiv,
}: WaveformPlotProps) {
  const channels = ["ch1", "ch2", "ch3", "ch4"] as const;

  // --- X axis: full scope window ---
  const tStart = data.length ? data[0].time : 0;
  const tEnd = tStart + timebaseScaleSDiv * NUM_X_DIVS;
  const xRange: [number, number] = [tStart, tEnd];
  const xStep = (xRange[1] - xRange[0]) / NUM_X_DIVS;
  const xTicks = Array.from(
    { length: NUM_X_DIVS + 1 },
    (_, i) => xRange[0] + i * xStep,
  );

  // --- Y axis: 8 divisions centred on 0 V ---
  const enabledScales = Object.entries(channelScales ?? {})
    .filter(([k]) => enabledChannels[`ch${k}` as keyof typeof enabledChannels])
    .map(([, v]) => v);
  const maxScale = enabledScales.length ? Math.max(...enabledScales) : 1.0;
  const yHalf = (NUM_Y_DIVS / 2) * maxScale;
  const yMin = -yHalf;
  const yMax = yHalf;
  const yStep = (yMax - yMin) / NUM_Y_DIVS;
  const yTicks = Array.from(
    { length: NUM_Y_DIVS + 1 },
    (_, i) => yMin + i * yStep,
  );

  // Build one Plotly trace per enabled channel that has actual data.
  const traces: Data[] = channels
    .map((ch, i): Data | null => {
      if (!enabledChannels[ch]) return null;
      const xs: number[] = [];
      const ys: number[] = [];
      const timeLabels: string[] = [];
      for (const pt of data) {
        const v = pt[ch];
        if (v === undefined) continue;
        xs.push(pt.time);
        ys.push(v);
        timeLabels.push(formatTimeLabel(pt.time));
      }
      if (xs.length === 0) return null;
      return {
        x: xs,
        y: ys,
        customdata: timeLabels,
        type: "scatter",
        mode: "lines",
        name: `CH${i + 1}`,
        line: { color: CHANNEL_COLORS[i], width: 2 },
        hovertemplate: `<b>CH${i + 1}</b><br>%{y:.4f} V<extra></extra>`,
      } as Data;
    })
    .filter((t): t is Data => t !== null);

  // Trigger reference lines as Plotly shapes
  const shapes: Partial<Shape>[] = [];
  if (triggerLevel !== undefined) {
    shapes.push({
      type: "line",
      xref: "paper",
      yref: "y",
      x0: 0,
      x1: 1,
      y0: triggerLevel,
      y1: triggerLevel,
      line: { color: "#F59E0B", width: 1, dash: "dash" },
    });
  }
  if (triggerTime !== undefined) {
    shapes.push({
      type: "line",
      xref: "x",
      yref: "paper",
      x0: triggerTime,
      x1: triggerTime,
      y0: 0,
      y1: 1,
      line: { color: "#F59E0B", width: 1, dash: "dash" },
    });
  }

  const layout: Partial<Layout> = {
    paper_bgcolor: "white",
    plot_bgcolor: "white",
    margin: { t: 36, r: 20, b: 48, l: 64 },
    xaxis: {
      range: xRange,
      tickvals: xTicks,
      ticktext: xTicks.map(formatTimeLabel),
      gridcolor: "#E5E7EB",
      gridwidth: 1,
      zeroline: false,
      tickfont: {
        family: "JetBrains Mono, monospace",
        size: 10,
        color: "#6B7280",
      },
      title: { text: "Zeit (s)", font: { size: 11, color: "#6B7280" } },
      fixedrange: false,
    },
    yaxis: {
      range: [yMin, yMax],
      tickvals: yTicks,
      ticktext: yTicks.map((v) => v.toFixed(2)),
      gridcolor: "#E5E7EB",
      gridwidth: 1,
      zeroline: true,
      zerolinecolor: "#D1D5DB",
      zerolinewidth: 1,
      tickfont: {
        family: "JetBrains Mono, monospace",
        size: 10,
        color: "#6B7280",
      },
      title: { text: "V", font: { size: 11, color: "#6B7280" } },
      fixedrange: false,
    },
    legend: {
      orientation: "v",
      xanchor: "right",
      x: 1.0,
      y: 1.0,
      font: { family: "JetBrains Mono, monospace", size: 11 },
      bgcolor: "rgba(255,255,255,0.8)",
    },
    shapes,
    annotations: [
      {
        xref: "paper",
        yref: "paper",
        x: 0.01,
        y: 1.02,
        xanchor: "left",
        yanchor: "bottom",
        text: `${timebase}   ${sampleRate}`,
        showarrow: false,
        font: {
          family: "JetBrains Mono, monospace",
          size: 11,
          color: "#6B7280",
        },
      },
    ],
    dragmode: "zoom",
    hovermode: "x unified",
    autosize: true,
  };

  return (
    <div className="relative w-full h-full bg-white border-2 border-(--lab-border) rounded overflow-hidden">
      <Plot
        data={traces}
        layout={layout}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
        config={{
          displaylogo: false,
          modeBarButtonsToRemove: ["select2d", "lasso2d", "toImage"],
          scrollZoom: true,
          responsive: true,
        }}
      />
    </div>
  );
}
