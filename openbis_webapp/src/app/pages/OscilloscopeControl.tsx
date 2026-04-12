import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { StatusBadge } from "../components/StatusBadge";
import { NumericInput } from "../components/NumericInput";
import { SegmentedControl } from "../components/SegmentedControl";
import { WaveformPlot } from "../components/WaveformPlot";
import {
  ArrowLeft,
  Play,
  Square,
  Zap,
  Camera,
  ZoomIn,
  ZoomOut,
  Move,
  RotateCcw,
  Download,
  Lock,
  Unlock,
  Database,
} from "lucide-react";

// Generate sample waveform data
const generateWaveformData = () => {
  const data = [];
  for (let i = 0; i < 500; i++) {
    const time = (i / 500) * 10; // 10 time units
    data.push({
      time: parseFloat(time.toFixed(3)),
      ch1: 2 * Math.sin(2 * Math.PI * time) + 0.2 * Math.random(),
      ch2: 1.5 * Math.cos(2 * Math.PI * time * 1.5) + 0.2 * Math.random(),
      ch3: 1 * Math.sin(2 * Math.PI * time * 0.5) + 0.1 * Math.random(),
      ch4: 0.8 * Math.cos(2 * Math.PI * time * 2) + 0.1 * Math.random(),
    });
  }
  return data;
};

export function OscilloscopeControl() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const [isLocked, setIsLocked] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "channels" | "timebase" | "trigger"
  >("channels");

  const [enabledChannels, setEnabledChannels] = useState({
    ch1: true,
    ch2: true,
    ch3: false,
    ch4: false,
  });

  const [channelSettings, setChannelSettings] = useState({
    ch1: { scale: 1.0, offset: 0, coupling: "DC", probe: "1×" },
    ch2: { scale: 1.0, offset: 0, coupling: "DC", probe: "1×" },
    ch3: { scale: 1.0, offset: 0, coupling: "DC", probe: "1×" },
    ch4: { scale: 1.0, offset: 0, coupling: "DC", probe: "1×" },
  });

  const [timebaseSettings, setTimebaseSettings] = useState({
    horizontalScale: "1 ms/div",
    horizontalOffset: 0,
    acquisitionMode: "Normal",
    memoryDepth: "1M",
  });

  const [triggerSettings, setTriggerSettings] = useState({
    mode: "AUTO",
    type: "EDGE",
    source: "CH1",
    slope: "Rising",
    level: 0.5,
  });

  const waveformData = generateWaveformData();

  const toggleChannel = (channel: keyof typeof enabledChannels) => {
    setEnabledChannels((prev) => ({ ...prev, [channel]: !prev[channel] }));
  };

  return (
    <div className="h-screen bg-(--lab-bg) flex flex-col">
      {/* Header */}
      <header className="bg-white border-b-2 border-(--lab-border) px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-1.5 border-2 border-(--lab-border)] hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-[var(--lab-text-primary)"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-(--lab-text-primary)">
              Tektronix MDO3024
            </h1>
            <StatusBadge status="ONLINE" />
          </div>
        </div>

        <button
          onClick={() => navigate("/archive")}
          className="flex items-center gap-2 px-3 py-1.5 border-2 border-(--lab-border)] text-sm text-(--lab-text-secondary) hover:text-(--lab-text-primary) hover:bg-[var(--lab-panel) rounded transition-colors"
        >
          <Database className="w-4 h-4" />
          Data Archive
        </button>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-64 bg-(--lab-panel)] border-r-2 border-[var(--lab-border) p-4 space-y-4 overflow-y-auto">
          <div>
            <h3 className="text-xs font-medium text-(--lab-text-secondary) uppercase mb-2">
              Device Control
            </h3>
            <button
              onClick={() => setIsLocked(!isLocked)}
              className={`w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm transition-colors ${
                isLocked
                  ? "bg-white text-(--lab-warning)] border-[var(--lab-warning)"
                  : "bg-white border-(--lab-border)] text-(--lab-text-primary) hover:bg-[var(--lab-panel)"
              }`}
            >
              {isLocked ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
              {isLocked ? "Release Lock" : "Acquire Lock"}
            </button>
            {isLocked && (
              <p className="text-xs text-(--lab-text-secondary) mt-2">
                Locked by you
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-medium text-(--lab-text-secondary) uppercase">
              Acquisition
            </h3>
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 border-2 rounded font-semibold transition-colors ${
                isRunning
                  ? "bg-(--lab-success)] border-(--lab-success) text-white hover:bg-[#047857"
                  : "bg-white border-(--lab-success)] text-(--lab-success) hover:bg-[var(--lab-success) hover:text-white"
              }`}
            >
              <Play className="w-5 h-5" />
              {isRunning ? "RUNNING" : "RUN"}
            </button>
            <button className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 rounded font-semibold bg-white border-(--lab-danger)] text-(--lab-danger) hover:bg-[var(--lab-danger) hover:text-white transition-colors">
              <Square className="w-5 h-5" />
              STOP
            </button>
            <button className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-border)] text-(--lab-text-primary) hover:bg-[var(--lab-panel) transition-colors">
              SINGLE
            </button>
            <button className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-border)] text-(--lab-text-primary) hover:bg-[var(--lab-panel) transition-colors">
              <Zap className="w-4 h-4" />
              Force Trigger
            </button>
          </div>

          <div>
            <button className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-accent)] text-(--lab-accent) hover:bg-[var(--lab-accent) hover:text-white transition-colors">
              <Camera className="w-4 h-4" />
              Capture Screenshot
            </button>
          </div>
        </aside>

        {/* Center - Waveform display */}
        <main className="flex-1 flex flex-col p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-(--lab-text-secondary)">
              Waveform Display
            </h2>
            <div className="flex items-center gap-1">
              <button className="p-1.5 border-2 border-(--lab-border)] hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-[var(--lab-text-primary)">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button className="p-1.5 border-2 border-(--lab-border)] hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-[var(--lab-text-primary)">
                <ZoomOut className="w-4 h-4" />
              </button>
              <button className="p-1.5 border-2 border-(--lab-border)] hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-[var(--lab-text-primary)">
                <Move className="w-4 h-4" />
              </button>
              <button className="p-1.5 border-2 border-(--lab-border)] hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-[var(--lab-text-primary)">
                <RotateCcw className="w-4 h-4" />
              </button>
              <div className="w-0.5 h-4 bg-(--lab-border) mx-1" />
              <button className="p-1.5 border-2 border-(--lab-border)] hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-[var(--lab-text-primary)">
                <Download className="w-4 h-4" />
              </button>
              <span className="text-xs text-(--lab-text-secondary) ml-1">
                CSV
              </span>
              <button className="p-1.5 border-2 border-(--lab-border)] hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-[var(--lab-text-primary)">
                <Download className="w-4 h-4" />
              </button>
              <span className="text-xs text-(--lab-text-secondary) ml-1">
                HDF5
              </span>
            </div>
          </div>

          <div className="flex-1">
            <WaveformPlot
              data={waveformData}
              enabledChannels={enabledChannels}
              triggerLevel={triggerSettings.level}
              timebase="Timebase: 1.00 ms/div"
              sampleRate="Sample rate: 1.00 GSa/s"
            />
          </div>
        </main>

        {/* Right settings panel */}
        <aside className="w-80 bg-(--lab-panel)] border-l-2 border-[var(--lab-border) flex flex-col">
          <div className="border-b-2 border-(--lab-border)">
            <div className="flex">
              {(["channels", "timebase", "trigger"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? "text-(--lab-text-primary)] border-b-2 border-[var(--lab-accent)"
                      : "text-(--lab-text-secondary)] hover:text-[var(--lab-text-primary)"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === "channels" && (
              <>
                {(["ch1", "ch2", "ch3", "ch4"] as const).map(
                  (channel, index) => {
                    const channelNum = index + 1;
                    const color = `var(--ch${channelNum}-color)`;
                    const enabled = enabledChannels[channel];
                    const settings = channelSettings[channel];

                    return (
                      <div
                        key={channel}
                        className="border-2 border-(--lab-border) rounded overflow-hidden bg-white"
                      >
                        <button
                          onClick={() => toggleChannel(channel)}
                          className="w-full flex items-center justify-between p-3 hover:bg-(--lab-panel) transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full border-2"
                              style={{
                                backgroundColor: enabled ? color : "#FFFFFF",
                                borderColor: color,
                              }}
                            />
                            <span className="font-medium text-sm text-(--lab-text-primary)">
                              CH{channelNum}
                            </span>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-(--lab-text-secondary)">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => toggleChannel(channel)}
                              className="w-4 h-4 accent-(--lab-accent)"
                            />
                            Enable
                          </label>
                        </button>

                        {enabled && (
                          <div className="px-3 pb-3 space-y-3 border-t-2 border-(--lab-border)">
                            <div className="pt-3">
                              <label className="block text-xs text-(--lab-text-secondary) mb-1">
                                Vertical Scale
                              </label>
                              <NumericInput
                                value={settings.scale}
                                unit="V/div"
                                onChange={(val) =>
                                  setChannelSettings((prev) => ({
                                    ...prev,
                                    [channel]: { ...prev[channel], scale: val },
                                  }))
                                }
                                step={0.5}
                                min={0.1}
                                max={10}
                              />
                            </div>

                            <div>
                              <label className="block text-xs text-(--lab-text-secondary) mb-1">
                                Offset
                              </label>
                              <NumericInput
                                value={settings.offset}
                                unit="V"
                                onChange={(val) =>
                                  setChannelSettings((prev) => ({
                                    ...prev,
                                    [channel]: {
                                      ...prev[channel],
                                      offset: val,
                                    },
                                  }))
                                }
                                step={0.1}
                                min={-10}
                                max={10}
                              />
                            </div>

                            <div>
                              <label className="block text-xs text-(--lab-text-secondary) mb-1">
                                Coupling
                              </label>
                              <SegmentedControl
                                options={["AC", "DC", "GND"]}
                                value={settings.coupling}
                                onChange={(val) =>
                                  setChannelSettings((prev) => ({
                                    ...prev,
                                    [channel]: {
                                      ...prev[channel],
                                      coupling: val,
                                    },
                                  }))
                                }
                                className="w-full"
                              />
                            </div>

                            <div>
                              <label className="block text-xs text-(--lab-text-secondary) mb-1">
                                Probe Attenuation
                              </label>
                              <SegmentedControl
                                options={["1×", "10×", "100×"]}
                                value={settings.probe}
                                onChange={(val) =>
                                  setChannelSettings((prev) => ({
                                    ...prev,
                                    [channel]: { ...prev[channel], probe: val },
                                  }))
                                }
                                className="w-full"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  },
                )}
              </>
            )}

            {activeTab === "timebase" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-2">
                    Horizontal Scale
                  </label>
                  <select
                    value={timebaseSettings.horizontalScale}
                    onChange={(e) =>
                      setTimebaseSettings((prev) => ({
                        ...prev,
                        horizontalScale: e.target.value,
                      }))
                    }
                    className="w-full bg-white border-2 border-(--lab-border)] text-(--lab-text-primary) px-3 py-2 text-sm rounded focus:outline-none focus:border-[var(--lab-accent)"
                  >
                    <option>5 ns/div</option>
                    <option>10 ns/div</option>
                    <option>20 ns/div</option>
                    <option>50 ns/div</option>
                    <option>100 ns/div</option>
                    <option>1 µs/div</option>
                    <option>1 ms/div</option>
                    <option>10 ms/div</option>
                    <option>1 s/div</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-1">
                    Horizontal Offset
                  </label>
                  <NumericInput
                    value={timebaseSettings.horizontalOffset}
                    unit="s"
                    onChange={(val) =>
                      setTimebaseSettings((prev) => ({
                        ...prev,
                        horizontalOffset: val,
                      }))
                    }
                    step={0.01}
                  />
                </div>

                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-2">
                    Acquisition Mode
                  </label>
                  <select
                    value={timebaseSettings.acquisitionMode}
                    onChange={(e) =>
                      setTimebaseSettings((prev) => ({
                        ...prev,
                        acquisitionMode: e.target.value,
                      }))
                    }
                    className="w-full bg-white border-2 border-(--lab-border)] text-(--lab-text-primary) px-3 py-2 text-sm rounded focus:outline-none focus:border-[var(--lab-accent)"
                  >
                    <option>Normal</option>
                    <option>Average</option>
                    <option>Peak</option>
                    <option>High Resolution</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-2">
                    Memory Depth
                  </label>
                  <select
                    value={timebaseSettings.memoryDepth}
                    onChange={(e) =>
                      setTimebaseSettings((prev) => ({
                        ...prev,
                        memoryDepth: e.target.value,
                      }))
                    }
                    className="w-full bg-white border-2 border-(--lab-border)] text-(--lab-text-primary) px-3 py-2 text-sm rounded focus:outline-none focus:border-[var(--lab-accent)"
                  >
                    <option>1K</option>
                    <option>10K</option>
                    <option>100K</option>
                    <option>1M</option>
                    <option>10M</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === "trigger" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-2">
                    Mode
                  </label>
                  <SegmentedControl
                    options={["AUTO", "NORMAL", "SINGLE"]}
                    value={triggerSettings.mode}
                    onChange={(val) =>
                      setTriggerSettings((prev) => ({ ...prev, mode: val }))
                    }
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-2">
                    Type
                  </label>
                  <select
                    value={triggerSettings.type}
                    onChange={(e) =>
                      setTriggerSettings((prev) => ({
                        ...prev,
                        type: e.target.value,
                      }))
                    }
                    className="w-full bg-white border-2 border-(--lab-border)] text-(--lab-text-primary) px-3 py-2 text-sm rounded focus:outline-none focus:border-[var(--lab-accent)"
                  >
                    <option>EDGE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-2">
                    Source
                  </label>
                  <SegmentedControl
                    options={["CH1", "CH2", "CH3", "CH4", "EXT"]}
                    value={triggerSettings.source}
                    onChange={(val) =>
                      setTriggerSettings((prev) => ({ ...prev, source: val }))
                    }
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-2">
                    Slope
                  </label>
                  <SegmentedControl
                    options={["Rising", "Falling", "Either"]}
                    value={triggerSettings.slope}
                    onChange={(val) =>
                      setTriggerSettings((prev) => ({ ...prev, slope: val }))
                    }
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-1">
                    Level
                  </label>
                  <NumericInput
                    value={triggerSettings.level}
                    unit="V"
                    onChange={(val) =>
                      setTriggerSettings((prev) => ({ ...prev, level: val }))
                    }
                    step={0.1}
                    min={-10}
                    max={10}
                  />
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
