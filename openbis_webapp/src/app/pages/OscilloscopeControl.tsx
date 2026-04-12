import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { StatusBadge } from "../components/StatusBadge";
import { NumericInput } from "../components/NumericInput";
import { SegmentedControl } from "../components/SegmentedControl";
import { WaveformPlot } from "../components/WaveformPlot";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../../api/client";
import {
  getDevice,
  acquireLock,
  releaseLock,
  sendHeartbeat,
  runDevice,
  stopDevice,
  acquireWaveforms,
  getChannelData,
  getScreenshot,
  getSettings,
  setChannelConfig,
  setTimebase,
  setTrigger,
} from "../../api/devices";
import type {
  DeviceDetail,
  WaveformData,
  ChannelConfig,
  TimebaseConfig,
  TriggerConfig,
} from "../../api/types";
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

// ---------------------------------------------------------------------------
// Waveform helpers
// ---------------------------------------------------------------------------

type PlotPoint = {
  time: number;
  ch1?: number;
  ch2?: number;
  ch3?: number;
  ch4?: number;
};

/** Uniform downsample to at most maxLen points. */
function downsample(arr: number[], maxLen: number): number[] {
  if (arr.length <= maxLen) return arr;
  const step = arr.length / maxLen;
  return Array.from({ length: maxLen }, (_, i) => arr[Math.floor(i * step)]);
}

function buildPlotData(
  channelData: Record<number, WaveformData>,
  maxPoints = 2000,
): PlotPoint[] {
  const entries = Object.entries(channelData) as [string, WaveformData][];
  if (!entries.length) return [];

  const firstTime = downsample(entries[0][1].time_s, maxPoints);

  return firstTime.map((time, i) => {
    const point: PlotPoint = { time };
    for (const [ch, data] of entries) {
      const volts = downsample(data.voltage_V, maxPoints);
      (point as Record<string, number>)[`ch${ch}`] = volts[i] ?? 0;
    }
    return point;
  });
}

function formatSampleRate(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)} GSa/s`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MSa/s`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)} kSa/s`;
  return `${hz.toFixed(0)} Sa/s`;
}

function formatTimebase(sPerDiv: number): string {
  if (sPerDiv < 1e-6) return `${(sPerDiv * 1e9).toFixed(0)} ns/div`;
  if (sPerDiv < 1e-3) return `${(sPerDiv * 1e6).toFixed(0)} µs/div`;
  if (sPerDiv < 1) return `${(sPerDiv * 1e3).toFixed(0)} ms/div`;
  return `${sPerDiv.toFixed(0)} s/div`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000; // 4 min (TTL is 30 min)

export function OscilloscopeControl() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  // Device state
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // Lock state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockLoading, setLockLoading] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Acquisition state
  const [isRunning, setIsRunning] = useState(false);
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [cmdError, setCmdError] = useState<string | null>(null);
  const [waveformData, setWaveformData] = useState<PlotPoint[]>([]);
  const [timebaseLabel, setTimebaseLabel] = useState("Timebase: —");
  const [sampleRateLabel, setSampleRateLabel] = useState("Sample rate: —");
  // (enabledChannels is derived from channelSettings below the settings state block)

  // Settings panel state
  const [activeTab, setActiveTab] = useState<
    "channels" | "timebase" | "trigger"
  >("channels");

  // Pending (locally edited) settings — what the user sees in the controls
  const [channelSettings, setChannelSettings] = useState<
    Record<number, ChannelConfig>
  >({
    1: { enabled: true,  scale_v_div: 1.0, offset_v: 0, coupling: "DC", probe_attenuation: 1 },
    2: { enabled: false, scale_v_div: 1.0, offset_v: 0, coupling: "DC", probe_attenuation: 1 },
    3: { enabled: false, scale_v_div: 1.0, offset_v: 0, coupling: "DC", probe_attenuation: 1 },
    4: { enabled: false, scale_v_div: 1.0, offset_v: 0, coupling: "DC", probe_attenuation: 1 },
  });
  const [timebaseSettings, setTimebaseSettings] = useState<
    Omit<TimebaseConfig, "sample_rate">
  >({ scale_s_div: 1e-3, offset_s: 0 });
  const [triggerSettings, setTriggerSettings] = useState<TriggerConfig>({
    source: "CH1", level_v: 0.0, slope: "RISE", mode: "AUTO",
  });

  // Applied (what the scope actually has) — used to detect dirty state
  const [appliedChannels, setAppliedChannels] = useState<
    Record<number, ChannelConfig>
  >({});
  const [appliedTimebase, setAppliedTimebase] = useState<
    Omit<TimebaseConfig, "sample_rate"> | null
  >(null);
  const [appliedTrigger, setAppliedTrigger] = useState<TriggerConfig | null>(null);

  // Apply-in-progress and per-panel errors
  const [applyingChannels, setApplyingChannels] = useState(false);
  const [applyingTimebase, setApplyingTimebase] = useState(false);
  const [applyingTrigger, setApplyingTrigger] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Derive dirty flags from shallow comparison
  const channelsDirty = Object.keys(channelSettings).some((k) => {
    const ch = Number(k);
    const p = channelSettings[ch];
    const a = appliedChannels[ch];
    if (!a) return true;
    return (
      p.enabled !== a.enabled ||
      p.scale_v_div !== a.scale_v_div ||
      p.offset_v !== a.offset_v ||
      p.coupling !== a.coupling ||
      p.probe_attenuation !== a.probe_attenuation
    );
  });
  const timebaseDirty =
    !appliedTimebase ||
    timebaseSettings.scale_s_div !== appliedTimebase.scale_s_div ||
    timebaseSettings.offset_s !== appliedTimebase.offset_s;
  const triggerDirty =
    !appliedTrigger ||
    triggerSettings.source !== appliedTrigger.source ||
    triggerSettings.level_v !== appliedTrigger.level_v ||
    triggerSettings.slope !== appliedTrigger.slope ||
    triggerSettings.mode !== appliedTrigger.mode;

  // enabledChannels derived from channelSettings (for WaveformPlot)
  const enabledChannels = {
    ch1: channelSettings[1]?.enabled ?? false,
    ch2: channelSettings[2]?.enabled ?? false,
    ch3: channelSettings[3]?.enabled ?? false,
    ch4: channelSettings[4]?.enabled ?? false,
  };

  // Fetch settings from scope and populate both pending and applied state
  const loadSettings = useCallback(async () => {
    if (!token || !deviceId) return;
    try {
      const s = await getSettings(token, deviceId);
      const chMap: Record<number, ChannelConfig> = {};
      for (const [k, v] of Object.entries(s.channels)) {
        chMap[Number(k)] = v as ChannelConfig;
      }
      setChannelSettings(chMap);
      setAppliedChannels(chMap);
      const tb = { scale_s_div: s.timebase.scale_s_div, offset_s: s.timebase.offset_s };
      setTimebaseSettings(tb);
      setAppliedTimebase(tb);
      setTriggerSettings(s.trigger);
      setAppliedTrigger(s.trigger);
    } catch {
      // Non-fatal — controls remain at defaults if settings can't be read
    }
  }, [token, deviceId]);

  // Load device info on mount; restore sessionId if we already own the lock
  useEffect(() => {
    if (!token || !deviceId) return;
    getDevice(token, deviceId)
      .then((d) => {
        setDevice(d);
        // Reclaim control after logout/login with same credentials
        if (d.lock?.is_mine && d.lock.session_id && !sessionId) {
          setSessionId(d.lock.session_id);
        }
        // Always sync controls with the scope's actual state on page load
        loadSettings();
      })
      .catch((err) =>
        setDeviceError(
          err instanceof Error ? err.message : "Failed to load device",
        ),
      );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, deviceId]);

  // Heartbeat: renew lock every 4 min while we hold it
  useEffect(() => {
    if (!sessionId || !token || !deviceId) return;

    heartbeatRef.current = setInterval(async () => {
      try {
        await sendHeartbeat(token, deviceId, sessionId);
      } catch {
        // If heartbeat fails the lock has likely expired — clear local state
        setSessionId(null);
        setLockError("Lock expired. Please re-acquire.");
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [sessionId, token, deviceId]);

  // ---------------------------------------------------------------------------
  // Lock actions
  // ---------------------------------------------------------------------------

  const handleAcquireLock = async () => {
    if (!token || !deviceId) return;
    setLockError(null);
    setLockLoading(true);
    try {
      const res = await acquireLock(token, deviceId);
      setSessionId(res.control_session_id);
      // Refresh device to show LOCKED state and sync controls with scope
      const updated = await getDevice(token, deviceId);
      setDevice(updated);
      await loadSettings();
    } catch (err) {
      setLockError(
        err instanceof ApiError ? err.message : "Failed to acquire lock",
      );
    } finally {
      setLockLoading(false);
    }
  };

  const handleReleaseLock = async () => {
    if (!token || !deviceId || !sessionId) return;
    setLockLoading(true);
    try {
      await releaseLock(token, deviceId, sessionId);
      setSessionId(null);
      setIsRunning(false);
      setWaveformData([]);
      const updated = await getDevice(token, deviceId);
      setDevice(updated);
    } catch (err) {
      setLockError(
        err instanceof ApiError ? err.message : "Failed to release lock",
      );
    } finally {
      setLockLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Apply settings to scope
  // ---------------------------------------------------------------------------

  const handleApplyChannels = async () => {
    if (!token || !deviceId || !sessionId) return;
    setApplyingChannels(true);
    setApplyError(null);
    try {
      for (const [k, cfg] of Object.entries(channelSettings)) {
        await setChannelConfig(token, deviceId, Number(k), sessionId, cfg);
      }
      setAppliedChannels({ ...channelSettings });
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to apply channel settings");
    } finally {
      setApplyingChannels(false);
    }
  };

  const handleApplyTimebase = async () => {
    if (!token || !deviceId || !sessionId) return;
    setApplyingTimebase(true);
    setApplyError(null);
    try {
      await setTimebase(token, deviceId, sessionId, timebaseSettings);
      setAppliedTimebase({ ...timebaseSettings });
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to apply timebase");
    } finally {
      setApplyingTimebase(false);
    }
  };

  const handleApplyTrigger = async () => {
    if (!token || !deviceId || !sessionId) return;
    setApplyingTrigger(true);
    setApplyError(null);
    try {
      await setTrigger(token, deviceId, sessionId, triggerSettings);
      setAppliedTrigger({ ...triggerSettings });
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to apply trigger");
    } finally {
      setApplyingTrigger(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Instrument commands (require lock)
  // ---------------------------------------------------------------------------

  const withCmdError = useCallback(async (fn: () => Promise<void>) => {
    setCmdError(null);
    try {
      await fn();
    } catch (err) {
      setCmdError(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  const handleRun = () =>
    withCmdError(async () => {
      await runDevice(token!, deviceId!, sessionId!);
      setIsRunning(true);
    });

  const handleStop = () =>
    withCmdError(async () => {
      await stopDevice(token!, deviceId!, sessionId!);
      setIsRunning(false);
    });

  const handleAcquire = async () => {
    if (!token || !deviceId || !sessionId) return;
    setIsAcquiring(true);
    setCmdError(null);
    try {
      await acquireWaveforms(token, deviceId, sessionId);

      // Fetch data for all channels; skip any that have no trace yet
      const channelDataMap: Record<number, WaveformData> = {};

      for (let ch = 1; ch <= 4; ch++) {
        try {
          const data = await getChannelData(token, deviceId, ch, sessionId);
          channelDataMap[ch] = data;
        } catch {
          // 404 = channel was not enabled / no data — skip silently
        }
      }

      setWaveformData(buildPlotData(channelDataMap));

      // Update readouts from the first available channel's preamble
      const firstData = Object.values(channelDataMap)[0];
      if (firstData && firstData.time_s.length >= 2) {
        const xInc = firstData.time_s[1] - firstData.time_s[0];
        const sr = xInc > 0 ? 1 / xInc : 0;
        setSampleRateLabel(`Sample rate: ${formatSampleRate(sr)}`);
        const totalTime =
          firstData.time_s[firstData.time_s.length - 1] - firstData.time_s[0];
        setSampleRateLabel(`Sample rate: ${formatSampleRate(sr)}`);
        setTimebaseLabel(`Timebase: ${formatTimebase(totalTime / 10)}`);
      }
    } catch (err) {
      setCmdError(err instanceof ApiError ? err.message : "Acquire failed");
    } finally {
      setIsAcquiring(false);
    }
  };

  const handleScreenshot = async () => {
    if (!token || !deviceId || !sessionId) return;
    setCmdError(null);
    try {
      const blob = await getScreenshot(token, deviceId, sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `screenshot_${deviceId}_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setCmdError(err instanceof ApiError ? err.message : "Screenshot failed");
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isLocked = !!sessionId;
  const canCommand = isLocked && device?.state !== "OFFLINE";

  if (deviceError) {
    return (
      <div className="h-screen bg-(--lab-bg) flex items-center justify-center">
        <p className="text-sm text-(--lab-danger)">{deviceError}</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-(--lab-bg) flex flex-col">
      {/* Header */}
      <header className="bg-white border-b-2 border-(--lab-border) px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-1.5 border-2 border-(--lab-border) hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-(--lab-text-primary)"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-(--lab-text-primary)">
              {device?.label ?? deviceId}
            </h1>
            {device && <StatusBadge status={device.state} />}
          </div>
        </div>

        <button
          onClick={() => sessionId && navigate(`/archive/${sessionId}`)}
          disabled={!sessionId}
          className="flex items-center gap-2 px-3 py-1.5 border-2 border-(--lab-border) text-sm text-(--lab-text-secondary) hover:text-(--lab-text-primary) hover:bg-(--lab-panel) rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Database className="w-4 h-4" />
          Data Archive
        </button>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-64 bg-(--lab-panel) border-r-2 border-(--lab-border) p-4 space-y-4 overflow-y-auto">
          {/* Lock */}
          <div>
            <h3 className="text-xs font-medium text-(--lab-text-secondary) uppercase mb-2">
              Device Control
            </h3>
            <button
              onClick={isLocked ? handleReleaseLock : handleAcquireLock}
              disabled={lockLoading || device?.state === "OFFLINE"}
              className={`w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isLocked
                  ? "bg-white text-(--lab-warning) border-(--lab-warning)"
                  : "bg-white border-(--lab-border) text-(--lab-text-primary) hover:bg-(--lab-panel)"
              }`}
            >
              {isLocked ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
              {lockLoading ? "…" : isLocked ? "Release Lock" : "Acquire Lock"}
            </button>
            {isLocked && (
              <p className="text-xs text-(--lab-text-secondary) mt-2 font-mono truncate">
                Session: {sessionId?.slice(0, 8)}…
              </p>
            )}
            {lockError && (
              <p className="text-xs text-(--lab-danger) mt-1">{lockError}</p>
            )}
          </div>

          {/* Acquisition buttons */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-(--lab-text-secondary) uppercase">
              Acquisition
            </h3>
            <button
              onClick={handleRun}
              disabled={!canCommand}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 border-2 rounded font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isRunning
                  ? "bg-(--lab-success) border-(--lab-success) text-white"
                  : "bg-white border-(--lab-success) text-(--lab-success) hover:bg-(--lab-success) hover:text-white"
              }`}
            >
              <Play className="w-5 h-5" />
              {isRunning ? "RUNNING" : "RUN"}
            </button>
            <button
              onClick={handleStop}
              disabled={!canCommand}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 rounded font-semibold bg-white border-(--lab-danger) text-(--lab-danger) hover:bg-(--lab-danger) hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Square className="w-5 h-5" />
              STOP
            </button>
            <button
              onClick={() =>
                withCmdError(async () => {
                  await stopDevice(token!, deviceId!, sessionId!);
                  setIsRunning(false);
                })
              }
              disabled={!canCommand}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-border) text-(--lab-text-primary) hover:bg-(--lab-panel) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              SINGLE
            </button>
            <button
              onClick={() =>
                withCmdError(async () => {
                  // Force trigger = stop then run (no dedicated API endpoint)
                  await stopDevice(token!, deviceId!, sessionId!);
                  await runDevice(token!, deviceId!, sessionId!);
                })
              }
              disabled={!canCommand}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-border) text-(--lab-text-primary) hover:bg-(--lab-panel) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Zap className="w-4 h-4" />
              Force Trigger
            </button>
          </div>

          {/* Acquire */}
          <div className="space-y-2">
            <button
              onClick={handleAcquire}
              disabled={!canCommand || isAcquiring}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-accent) text-(--lab-accent) hover:bg-(--lab-accent) hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isAcquiring ? "Acquiring…" : "ACQUIRE"}
            </button>
            <button
              onClick={handleScreenshot}
              disabled={!canCommand}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-border) text-(--lab-text-primary) hover:bg-(--lab-panel) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Camera className="w-4 h-4" />
              Screenshot
            </button>
          </div>

          {cmdError && (
            <p className="text-xs text-(--lab-danger) break-words">
              {cmdError}
            </p>
          )}
        </aside>

        {/* Center — waveform */}
        <main className="flex-1 flex flex-col p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-(--lab-text-secondary)">
              Waveform Display
            </h2>
            <div className="flex items-center gap-1">
              {(
                [
                  [ZoomIn, "Zoom in"],
                  [ZoomOut, "Zoom out"],
                  [Move, "Pan"],
                  [RotateCcw, "Reset"],
                ] as const
              ).map(([Icon, label]) => (
                <button
                  key={label}
                  title={label}
                  className="p-1.5 border-2 border-(--lab-border) hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-(--lab-text-primary)"
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
              <div className="w-0.5 h-4 bg-(--lab-border) mx-1" />
              <button
                title="Download CSV"
                className="p-1.5 border-2 border-(--lab-border) hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-(--lab-text-primary)"
              >
                <Download className="w-4 h-4" />
              </button>
              <span className="text-xs text-(--lab-text-secondary) ml-1">
                CSV
              </span>
            </div>
          </div>

          <div className="flex-1">
            {waveformData.length === 0 ? (
              <div className="w-full h-full border-2 border-(--lab-border) rounded flex items-center justify-center">
                <p className="text-sm text-(--lab-text-secondary)">
                  {isLocked
                    ? "Press ACQUIRE to capture waveform data"
                    : "Acquire a lock to start"}
                </p>
              </div>
            ) : (
              <WaveformPlot
                data={waveformData}
                enabledChannels={enabledChannels}
                triggerLevel={triggerSettings.level_v}
                timebase={timebaseLabel}
                sampleRate={sampleRateLabel}
              />
            )}
          </div>
        </main>

        {/* Right settings panel */}
        <aside className="w-80 bg-(--lab-panel) border-l-2 border-(--lab-border) flex flex-col">
          {/* Tab bar */}
          <div className="border-b-2 border-(--lab-border)">
            <div className="flex">
              {(
                [
                  ["channels", channelsDirty],
                  ["timebase", timebaseDirty],
                  ["trigger", triggerDirty],
                ] as const
              ).map(([tab, dirty]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-sm font-medium capitalize transition-colors relative ${
                    activeTab === tab
                      ? "text-(--lab-text-primary) border-b-2 border-(--lab-accent)"
                      : "text-(--lab-text-secondary) hover:text-(--lab-text-primary)"
                  }`}
                >
                  {tab}
                  {dirty && isLocked && (
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-(--lab-warning)" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ── Channels ── */}
            {activeTab === "channels" && (
              <>
                {([1, 2, 3, 4] as const).map((ch) => {
                  const color = `var(--ch${ch}-color)`;
                  const cfg = channelSettings[ch];
                  if (!cfg) return null;
                  const probeLabel = cfg.probe_attenuation === 1 ? "1×"
                    : cfg.probe_attenuation === 10 ? "10×" : "100×";

                  return (
                    <div
                      key={ch}
                      className="border-2 border-(--lab-border) rounded overflow-hidden bg-white"
                    >
                      <button
                        onClick={() =>
                          setChannelSettings((prev) => ({
                            ...prev,
                            [ch]: { ...prev[ch], enabled: !prev[ch].enabled },
                          }))
                        }
                        className="w-full flex items-center justify-between p-3 hover:bg-(--lab-panel) transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full border-2"
                            style={{
                              backgroundColor: cfg.enabled ? color : "#FFFFFF",
                              borderColor: color,
                            }}
                          />
                          <span className="font-medium text-sm text-(--lab-text-primary)">
                            CH{ch}
                          </span>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-(--lab-text-secondary)">
                          <input
                            type="checkbox"
                            checked={cfg.enabled}
                            onChange={() =>
                              setChannelSettings((prev) => ({
                                ...prev,
                                [ch]: { ...prev[ch], enabled: !prev[ch].enabled },
                              }))
                            }
                            className="w-4 h-4 accent-(--lab-accent)"
                          />
                          Enable
                        </label>
                      </button>

                      {cfg.enabled && (
                        <div className="px-3 pb-3 space-y-3 border-t-2 border-(--lab-border)">
                          <div className="pt-3">
                            <label className="block text-xs text-(--lab-text-secondary) mb-1">
                              Vertical Scale
                            </label>
                            <NumericInput
                              value={cfg.scale_v_div}
                              unit="V/div"
                              onChange={(val) =>
                                setChannelSettings((prev) => ({
                                  ...prev,
                                  [ch]: { ...prev[ch], scale_v_div: val },
                                }))
                              }
                              step={0.5}
                              min={0.001}
                              max={10}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-(--lab-text-secondary) mb-1">
                              Offset
                            </label>
                            <NumericInput
                              value={cfg.offset_v}
                              unit="V"
                              onChange={(val) =>
                                setChannelSettings((prev) => ({
                                  ...prev,
                                  [ch]: { ...prev[ch], offset_v: val },
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
                              value={cfg.coupling}
                              onChange={(val) =>
                                setChannelSettings((prev) => ({
                                  ...prev,
                                  [ch]: { ...prev[ch], coupling: val as "AC" | "DC" | "GND" },
                                }))
                              }
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-(--lab-text-secondary) mb-1">
                              Probe
                            </label>
                            <SegmentedControl
                              options={["1×", "10×", "100×"]}
                              value={probeLabel}
                              onChange={(val) =>
                                setChannelSettings((prev) => ({
                                  ...prev,
                                  [ch]: {
                                    ...prev[ch],
                                    probe_attenuation:
                                      val === "1×" ? 1 : val === "10×" ? 10 : 100,
                                  },
                                }))
                              }
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={handleApplyChannels}
                  disabled={!isLocked || applyingChannels || !channelsDirty}
                  className="w-full py-2 px-4 border-2 rounded font-medium text-sm transition-colors border-(--lab-accent) text-(--lab-accent) bg-white hover:bg-(--lab-accent) hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {applyingChannels ? "Applying…" : "Apply Channels"}
                </button>
              </>
            )}

            {/* ── Timebase ── */}
            {activeTab === "timebase" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-2">
                    Horizontal Scale
                  </label>
                  <select
                    value={timebaseSettings.scale_s_div}
                    onChange={(e) =>
                      setTimebaseSettings((prev) => ({
                        ...prev,
                        scale_s_div: Number(e.target.value),
                      }))
                    }
                    className="w-full bg-white border-2 border-(--lab-border) text-(--lab-text-primary) px-3 py-2 text-sm rounded focus:outline-none focus:border-(--lab-accent)"
                  >
                    {[
                      [5e-9,   "5 ns/div"],
                      [10e-9,  "10 ns/div"],
                      [20e-9,  "20 ns/div"],
                      [50e-9,  "50 ns/div"],
                      [100e-9, "100 ns/div"],
                      [1e-6,   "1 µs/div"],
                      [10e-6,  "10 µs/div"],
                      [100e-6, "100 µs/div"],
                      [1e-3,   "1 ms/div"],
                      [10e-3,  "10 ms/div"],
                      [100e-3, "100 ms/div"],
                      [1,      "1 s/div"],
                    ].map(([v, label]) => (
                      <option key={String(v)} value={Number(v)}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-1">
                    Horizontal Offset
                  </label>
                  <NumericInput
                    value={timebaseSettings.offset_s}
                    unit="s"
                    onChange={(val) =>
                      setTimebaseSettings((prev) => ({ ...prev, offset_s: val }))
                    }
                    step={0.001}
                  />
                </div>

                <button
                  onClick={handleApplyTimebase}
                  disabled={!isLocked || applyingTimebase || !timebaseDirty}
                  className="w-full py-2 px-4 border-2 rounded font-medium text-sm transition-colors border-(--lab-accent) text-(--lab-accent) bg-white hover:bg-(--lab-accent) hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {applyingTimebase ? "Applying…" : "Apply Timebase"}
                </button>
              </div>
            )}

            {/* ── Trigger ── */}
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
                      setTriggerSettings((prev) => ({
                        ...prev,
                        mode: val as TriggerConfig["mode"],
                      }))
                    }
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-2">
                    Source
                  </label>
                  <SegmentedControl
                    options={["CH1", "CH2", "CH3", "CH4"]}
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
                    options={["RISE", "FALL", "EITHER"]}
                    value={triggerSettings.slope}
                    onChange={(val) =>
                      setTriggerSettings((prev) => ({
                        ...prev,
                        slope: val as TriggerConfig["slope"],
                      }))
                    }
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-1">
                    Level
                  </label>
                  <NumericInput
                    value={triggerSettings.level_v}
                    unit="V"
                    onChange={(val) =>
                      setTriggerSettings((prev) => ({ ...prev, level_v: val }))
                    }
                    step={0.1}
                    min={-10}
                    max={10}
                  />
                </div>

                <button
                  onClick={handleApplyTrigger}
                  disabled={!isLocked || applyingTrigger || !triggerDirty}
                  className="w-full py-2 px-4 border-2 rounded font-medium text-sm transition-colors border-(--lab-accent) text-(--lab-accent) bg-white hover:bg-(--lab-accent) hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {applyingTrigger ? "Applying…" : "Apply Trigger"}
                </button>
              </div>
            )}

            {applyError && (
              <p className="text-xs text-(--lab-danger) break-words">{applyError}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
