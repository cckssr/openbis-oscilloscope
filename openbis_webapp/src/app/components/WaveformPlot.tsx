import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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
  channelScales?: Record<number, number>; // scale_v_div per channel
  triggerLevel?: number;
  timebase: string;
  sampleRate: string;
  /** Timebase setting from the scope in seconds/division. Used to compute grid. */
  timebaseScaleSDiv: number;
  /** Current x-axis domain [min, max] for zoom; undefined = full scope window */
  xDomain?: [number, number];
}

const NUM_X_DIVS = 10; // oscilloscope horizontal divisions
const NUM_Y_DIVS = 8;  // oscilloscope vertical divisions

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
  timebase,
  sampleRate,
  timebaseScaleSDiv,
  xDomain,
}: WaveformPlotProps) {
  const channelColors = [
    "var(--ch1-color)",
    "var(--ch2-color)",
    "var(--ch3-color)",
    "var(--ch4-color)",
  ];
  const channels = ["ch1", "ch2", "ch3", "ch4"] as const;

  // --- X axis: scope-driven, always 10 divisions wide ---
  // Anchor to the first data point so the grid stays locked to the waveform.
  const tStart = data.length ? data[0].time : 0;
  const tEnd = tStart + timebaseScaleSDiv * NUM_X_DIVS;
  // 11 tick lines at each division boundary (0, 1×, 2×, ..., 10×)
  const xTicksFull = Array.from(
    { length: NUM_X_DIVS + 1 },
    (_, i) => tStart + i * timebaseScaleSDiv,
  );
  // Zoomed domain or full scope window; recharts auto-filters xTicksFull to the visible range
  const xDomainResolved: [number, number] = xDomain ?? [tStart, tEnd];

  // --- Y axis: scope-driven, 8 divisions centred on 0 V ---
  // Use the largest enabled channel's V/div so the grid covers all traces.
  const enabledScales = Object.entries(channelScales ?? {})
    .filter(([k]) => enabledChannels[`ch${k}` as keyof typeof enabledChannels])
    .map(([, v]) => v);
  const maxScale = enabledScales.length ? Math.max(...enabledScales) : 1.0;
  const yHalf = (NUM_Y_DIVS / 2) * maxScale; // 4 × maxScale
  const yMin = -yHalf;
  const yMax = yHalf;
  // 9 tick lines: -4div, -3div, ..., 0, ..., +4div
  const yTicks = Array.from(
    { length: NUM_Y_DIVS + 1 },
    (_, i) => yMin + i * maxScale,
  );

  const lines = channels
    .map((channel, index) => {
      if (!enabledChannels[channel]) return null;
      return (
        <Line
          key={channel}
          type="monotone"
          dataKey={channel}
          stroke={channelColors[index]}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      );
    })
    .filter(Boolean);

  return (
    <div className="relative w-full h-full bg-white border-2 border-(--lab-border) rounded">
      {/* Readouts overlay */}
      <div className="absolute top-2 left-16 z-10 font-mono text-xs text-(--lab-text-secondary) pointer-events-none">
        {timebase} &nbsp;&nbsp; {sampleRate}
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 32, right: 20, bottom: 28, left: 56 }}
        >
          <CartesianGrid stroke="#E5E7EB" strokeWidth={1} />
          <XAxis
            dataKey="time"
            type="number"
            scale="linear"
            domain={xDomainResolved}
            ticks={xTicksFull}
            tickFormatter={formatTimeLabel}
            stroke="#6B7280"
            tick={{
              fill: "#6B7280",
              fontSize: 10,
              fontFamily: "JetBrains Mono",
            }}
            label={{
              value: "Time (s)",
              position: "insideBottom",
              offset: -12,
              fill: "#6B7280",
              fontSize: 11,
            }}
          />
          <YAxis
            domain={[yMin, yMax]}
            ticks={yTicks}
            tickFormatter={(v: number) => v.toFixed(2)}
            stroke="#6B7280"
            tick={{
              fill: "#6B7280",
              fontSize: 10,
              fontFamily: "JetBrains Mono",
            }}
            label={{
              value: "V",
              angle: -90,
              position: "insideLeft",
              offset: 10,
              fill: "#6B7280",
              fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFFF",
              border: "2px solid #D1D5DB",
              borderRadius: "4px",
              fontFamily: "JetBrains Mono",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#111827" }}
            labelFormatter={(v) => `t = ${formatTimeLabel(v as number)} s`}
            formatter={(v) => {
              if (v === undefined || v === null) return "";
              return [(v as number).toFixed(4) + " V"];
            }}
          />
          {triggerLevel !== undefined && (
            <Line
              data={[
                { time: xDomainResolved[0], _trigger: triggerLevel },
                { time: xDomainResolved[1], _trigger: triggerLevel },
              ]}
              type="linear"
              dataKey="_trigger"
              stroke="#F59E0B"
              strokeWidth={1}
              strokeDasharray="4 2"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {lines}
        </LineChart>
      </ResponsiveContainer>

      {/* Per-channel scale readouts */}
      <div className="absolute top-2 right-4 font-mono text-xs space-y-0.5 text-right pointer-events-none">
        {channels.map((ch, i) => {
          const n = i + 1;
          if (!enabledChannels[ch]) return null;
          const scale = channelScales?.[n];
          const label =
            scale !== undefined ? `CH${n} ${scale.toFixed(2)} V/div` : `CH${n}`;
          return (
            <div key={ch} style={{ color: channelColors[i] }}>
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
