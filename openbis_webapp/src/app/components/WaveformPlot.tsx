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
  triggerLevel?: number;
  timebase: string;
  sampleRate: string;
}

export function WaveformPlot({
  data,
  enabledChannels,
  triggerLevel,
  timebase,
  sampleRate,
}: WaveformPlotProps) {
  const channelColors = [
    "var(--ch1-color)",
    "var(--ch2-color)",
    "var(--ch3-color)",
    "var(--ch4-color)",
  ];
  const channels = ["ch1", "ch2", "ch3", "ch4"] as const;

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
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <CartesianGrid strokeDasharray="0" stroke="#E5E7EB" strokeWidth={1} />
          <XAxis
            dataKey="time"
            stroke="#6B7280"
            tick={{
              fill: "#6B7280",
              fontSize: 11,
              fontFamily: "JetBrains Mono",
            }}
            label={{
              value: "Time",
              position: "insideBottom",
              offset: -10,
              fill: "#6B7280",
            }}
          />
          <YAxis
            stroke="#6B7280"
            tick={{
              fill: "#6B7280",
              fontSize: 11,
              fontFamily: "JetBrains Mono",
            }}
            label={{
              value: "Voltage (V)",
              angle: -90,
              position: "insideLeft",
              fill: "#6B7280",
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
          />
          {lines}
        </LineChart>
      </ResponsiveContainer>

      <div className="absolute bottom-4 left-4 font-mono text-xs text-(--lab-text-secondary) space-y-0.5">
        <div>{timebase}</div>
        <div>{sampleRate}</div>
      </div>

      {enabledChannels.ch1 && (
        <div
          className="absolute top-4 right-4 font-mono text-xs"
          style={{ color: "var(--ch1-color)" }}
        >
          CH1 1.00 V/div
        </div>
      )}
    </div>
  );
}
