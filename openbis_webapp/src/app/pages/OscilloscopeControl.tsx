import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { StatusBadge } from "../components/StatusBadge";
import { WaveformPlot } from "../components/WaveformPlot";
import { ChannelsPanel } from "../components/ChannelsPanel";
import { TimebasePanel } from "../components/TimebasePanel";
import { TriggerPanel } from "../components/TriggerPanel";
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
  saveScreenshot,
  getSettings,
  setChannelConfig,
  setTimebase,
  setTrigger,
} from "../../api/devices";
import { setAnnotation } from "../../api/sessions";
import type {
  DeviceDetail,
  WaveformData,
  ChannelConfig,
  TimebaseConfig,
  TriggerConfig,
  AcquiredChannel,
} from "../../api/types";
import {
  ArrowLeft,
  Play,
  Square,
  Zap,
  Camera,
  Download,
  Lock,
  Unlock,
  Database,
  Settings,
  EyeOff,
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

function formatMemoryDepth(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} MPkt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} kPkt`;
  return `${n} Pkt`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;

const DEFAULT_CHANNEL_CFG: ChannelConfig = {
  enabled: false,
  scale_v_div: 1.0,
  offset_v: 0,
  coupling: "DC",
  probe_attenuation: 1,
};

export function OscilloscopeControl() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockLoading, setLockLoading] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const isAcquiringRef = useRef(false); // synchronous guard for overlapping acquires
  const [isAcquiring, setIsAcquiring] = useState(false); // for UI rendering only
  const [isAcquiringMax, setIsAcquiringMax] = useState(false);
  const [isScreenshotting, setIsScreenshotting] = useState(false);
  const [lastAcquisitionId, setLastAcquisitionId] = useState<string | null>(
    null,
  );
  const [annotationText, setAnnotationText] = useState("");
  const [annotationSaved, setAnnotationSaved] = useState(false);
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);
  const [cmdError, setCmdError] = useState<string | null>(null);
  const [waveformData, setWaveformData] = useState<PlotPoint[]>([]);
  // Full channel configs from the last acquire response — drives UI sync and plot
  const [acquiredChannels, setAcquiredChannels] = useState<AcquiredChannel[]>(
    [],
  );
  // Which acquired channels are currently visible in the plot (independent of scope enable state)
  const [visibleChannels, setVisibleChannels] = useState<Set<number>>(
    new Set(),
  );
  const [timebaseLabel, setTimebaseLabel] = useState("Zeitbasis: —");
  const [sampleRateLabel, setSampleRateLabel] = useState("Abtastrate: —");
  const [currentDepth, setCurrentDepth] = useState<number | null>(null);
  const [maxDepth, setMaxDepth] = useState<number | null>(null);
  const [actualTimebaseScaleSDiv, setActualTimebaseScaleSDiv] =
    useState<number>(1e-3);

  // Continuous acquisition: interval handle (fixed 1 Hz — acquisition takes ≥ 1 s)
  const runLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runIdRef = useRef<string | null>(null);

  // tStart of the most recently acquired waveform (kept for reference)
  const tStartRef = useRef<number>(0);

  const [activeTab, setActiveTab] = useState<
    "channels" | "timebase" | "trigger"
  >("channels");

  // Expert mode: persisted in localStorage; false = production-restricted view
  const [expertMode, setExpertMode] = useState(
    () => localStorage.getItem("expertMode") === "true",
  );
  const toggleExpertMode = () => {
    setExpertMode((prev) => {
      const next = !prev;
      localStorage.setItem("expertMode", String(next));
      // Switch back to channels tab if current tab would become hidden
      if (!next) setActiveTab("channels");
      return next;
    });
  };

  // Pending settings (what the user sees in the controls)
  const [channelSettings, setChannelSettings] = useState<
    Record<number, ChannelConfig>
  >({
    1: { ...DEFAULT_CHANNEL_CFG, enabled: true },
    2: { ...DEFAULT_CHANNEL_CFG },
    3: { ...DEFAULT_CHANNEL_CFG },
    4: { ...DEFAULT_CHANNEL_CFG },
  });
  const [timebaseSettings, setTimebaseSettings] = useState<
    Omit<TimebaseConfig, "sample_rate">
  >({ scale_s_div: 1e-3, offset_s: 0 });
  const [triggerSettings, setTriggerSettings] = useState<TriggerConfig>({
    source: "CH1",
    level_v: 0.0,
    slope: "RISE",
    mode: "AUTO",
  });

  // Applied state (what the scope actually has) — for dirty detection
  const [appliedChannels, setAppliedChannels] = useState<
    Record<number, ChannelConfig>
  >({});
  const [appliedTimebase, setAppliedTimebase] = useState<Omit<
    TimebaseConfig,
    "sample_rate"
  > | null>(null);
  const [appliedTrigger, setAppliedTrigger] = useState<TriggerConfig | null>(
    null,
  );

  const [applyingChannels, setApplyingChannels] = useState(false);
  const [applyingTimebase, setApplyingTimebase] = useState(false);
  const [applyingTrigger, setApplyingTrigger] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Derived state
  const isLocked = !!sessionId;

  // Dirty flags
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

  const enabledChannels = {
    ch1: channelSettings[1]?.enabled ?? false,
    ch2: channelSettings[2]?.enabled ?? false,
    ch3: channelSettings[3]?.enabled ?? false,
    ch4: channelSettings[4]?.enabled ?? false,
  };

  // Fetch settings and populate both pending and applied state
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
      const tb = {
        scale_s_div: s.timebase.scale_s_div,
        offset_s: s.timebase.offset_s,
      };
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
        if (d.lock?.is_mine && d.lock.session_id && !sessionId) {
          setSessionId(d.lock.session_id);
        }
        loadSettings();
      })
      .catch((err) =>
        setDeviceError(
          err instanceof Error
            ? err.message
            : "Gerät konnte nicht geladen werden",
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
        setSessionId(null);
        setLockError("Sperre abgelaufen. Bitte erneut sperren.");
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
      const updated = await getDevice(token, deviceId);
      setDevice(updated);
      await loadSettings();
    } catch (err) {
      setLockError(
        err instanceof ApiError
          ? err.message
          : "Gerät konnte nicht gesperrt werden",
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
        err instanceof ApiError
          ? err.message
          : "Sperre konnte nicht freigegeben werden",
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
      setApplyError(
        err instanceof Error
          ? err.message
          : "Kanaleinstellungen konnten nicht übernommen werden",
      );
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
      setApplyError(
        err instanceof Error
          ? err.message
          : "Zeitbasis konnte nicht übernommen werden",
      );
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
      setApplyError(
        err instanceof Error
          ? err.message
          : "Trigger konnte nicht übernommen werden",
      );
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
      runIdRef.current = crypto.randomUUID();
      setIsRunning(true);
    });

  const handleStop = () =>
    withCmdError(async () => {
      await stopDevice(token!, deviceId!, sessionId!);
      runIdRef.current = null;
      setIsRunning(false);
    });

  const handleAcquire = useCallback(
    async (maxSamples = false) => {
      if (!token || !deviceId || !sessionId) return;
      if (isAcquiringRef.current) return;
      const startTime = performance.now();
      isAcquiringRef.current = true;
      setIsAcquiring(true);
      if (maxSamples) setIsAcquiringMax(true);
      setCmdError(null);
      try {
        const enabledNums = Object.entries(channelSettings)
          .filter(([, cfg]) => cfg.enabled)
          .map(([k]) => Number(k));
        const acquireResp = await acquireWaveforms(
          token,
          deviceId,
          sessionId,
          enabledNums.length > 0 ? enabledNums : undefined,
          maxSamples,
          runIdRef.current,
        );
        setAcquiredChannels(acquireResp.channels);
        setLastAcquisitionId(acquireResp.acquisition_id);
        setAnnotationText("");
        setAnnotationSaved(false);

        const acquiredNums = new Set(
          acquireResp.channels.map((c) => c.channel),
        );
        const syncedSettings: Record<number, ChannelConfig> = {};
        for (let ch = 1; ch <= 4; ch++) {
          syncedSettings[ch] = {
            ...(channelSettings[ch] ?? DEFAULT_CHANNEL_CFG),
            enabled: acquiredNums.has(ch),
          };
        }
        for (const ac of acquireResp.channels) {
          syncedSettings[ac.channel] = {
            enabled: ac.enabled,
            scale_v_div: ac.scale_v_div,
            offset_v: ac.offset_v,
            coupling: ac.coupling,
            probe_attenuation: ac.probe_attenuation,
          };
        }
        setChannelSettings(syncedSettings);
        setAppliedChannels(syncedSettings);
        setVisibleChannels(new Set(acquireResp.channels.map((c) => c.channel)));

        const results = await Promise.all(
          acquireResp.channels.map(({ channel: ch }) =>
            getChannelData(token, deviceId, ch, sessionId).catch(() => null),
          ),
        );
        const channelDataMap: Record<number, WaveformData> = {};
        for (let i = 0; i < acquireResp.channels.length; i++) {
          const d = results[i];
          if (d) channelDataMap[acquireResp.channels[i].channel] = d;
        }

        const plot = buildPlotData(channelDataMap);
        setWaveformData(plot);
        if (plot.length > 0) tStartRef.current = plot[0].time;

        const firstData = Object.values(channelDataMap)[0];
        if (firstData && firstData.time_s.length >= 2) {
          const xInc = firstData.time_s[1] - firstData.time_s[0];
          const sr = xInc > 0 ? 1 / xInc : 0;
          setSampleRateLabel(`Abtastrate: ${formatSampleRate(sr)}`);
          const totalTime =
            firstData.time_s[firstData.time_s.length - 1] - firstData.time_s[0];
          const actualScale = totalTime / 10;
          setActualTimebaseScaleSDiv(actualScale);
          setTimebaseLabel(`Zeitbasis: ${formatTimebase(actualScale)}`);
          setCurrentDepth(firstData.time_s.length);
        }
      } catch (err) {
        setCmdError(
          err instanceof ApiError ? err.message : "Messung fehlgeschlagen",
        );
      } finally {
        isAcquiringRef.current = false;
        setIsAcquiring(false);
        setIsAcquiringMax(false);
        console.debug(
          `Acquisition completed in ${(performance.now() - startTime).toFixed(2)}ms`,
        );
      }
    },
    [token, deviceId, sessionId, channelSettings],
  );

  // Continuous acquisition loop — runs while isRunning is true
  useEffect(() => {
    if (!isRunning || !sessionId) {
      if (runLoopRef.current) {
        clearInterval(runLoopRef.current);
        runLoopRef.current = null;
      }
      return;
    }
    // Immediate first frame, then repeat at 1 Hz
    handleAcquire(false);
    runLoopRef.current = setInterval(() => handleAcquire(false), 1000);
    return () => {
      if (runLoopRef.current) {
        clearInterval(runLoopRef.current);
        runLoopRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, sessionId]);

  // ---------------------------------------------------------------------------
  // CSV download
  // ---------------------------------------------------------------------------

  const handleDownloadCsv = () => {
    if (!waveformData.length) return;
    const channels = (["ch1", "ch2", "ch3", "ch4"] as const).filter(
      (ch) => waveformData[0][ch] !== undefined,
    );
    const header = ["time_s", ...channels].join(",");
    const rows = waveformData.map((pt) =>
      [pt.time, ...channels.map((ch) => pt[ch] ?? "")].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waveform_${deviceId}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveAnnotation = async () => {
    if (!token || !sessionId || !lastAcquisitionId || !annotationText.trim())
      return;
    setIsSavingAnnotation(true);
    try {
      await setAnnotation(
        token,
        sessionId,
        lastAcquisitionId,
        annotationText.trim(),
      );
      setAnnotationSaved(true);
    } catch (err) {
      setCmdError(
        err instanceof ApiError
          ? err.message
          : "Beschriftung konnte nicht gespeichert werden",
      );
    } finally {
      setIsSavingAnnotation(false);
    }
  };

  const handleScreenshot = async () => {
    if (!token || !deviceId || !sessionId) return;
    setCmdError(null);
    setIsScreenshotting(true);
    try {
      // Capture live display for download AND save to buffer in parallel
      const [blob] = await Promise.all([
        getScreenshot(token, deviceId, sessionId),
        saveScreenshot(token, deviceId, sessionId).catch(() => null),
      ]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `screenshot_${deviceId}_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setCmdError(
        err instanceof ApiError ? err.message : "Screenshot fehlgeschlagen",
      );
    } finally {
      setIsScreenshotting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
              {device?.label + " (" + deviceId + ")"}
            </h1>
            {device && <StatusBadge status={device.state} />}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleExpertMode}
            title={
              expertMode
                ? "Zu eingeschränktem Modus wechseln"
                : "Zu Expertenmodus wechseln — ermöglicht Zeitbasis-, Trigger- und Kanaleinstellungen"
            }
            className={`flex items-center gap-2 px-3 py-1.5 border-2 text-sm rounded transition-colors ${
              expertMode
                ? "border-(--lab-accent) text-(--lab-accent) bg-white hover:bg-(--lab-accent) hover:text-white"
                : "border-(--lab-border) text-(--lab-text-secondary) bg-white hover:bg-(--lab-panel) hover:text-(--lab-text-primary)"
            }`}
          >
            {expertMode ? (
              <Settings className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
            {expertMode ? "Experte" : "Eingeschränkt"}
          </button>
          <button
            onClick={() => sessionId && navigate(`/archive/${sessionId}`)}
            disabled={!sessionId}
            title="Gespeicherte Messdaten dieser Sitzung anzeigen"
            className="flex items-center gap-2 px-3 py-1.5 border-2 border-(--lab-border) text-sm text-(--lab-text-secondary) hover:text-(--lab-text-primary) hover:bg-(--lab-panel) rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Database className="w-4 h-4" />
            Datenarchiv
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-64 bg-(--lab-panel) border-r-2 border-(--lab-border) p-4 space-y-4 overflow-y-auto">
          {/* Lock */}
          <div>
            <h3 className="text-xs font-medium text-(--lab-text-secondary) uppercase mb-2">
              Gerätekontrolle
            </h3>
            <button
              onClick={isLocked ? handleReleaseLock : handleAcquireLock}
              disabled={lockLoading || device?.state === "OFFLINE"}
              title={
                isLocked
                  ? "Gerät für andere Benutzer freigeben"
                  : "Gerät exklusiv für diese Sitzung sperren — verhindert gleichzeitige Bedienung"
              }
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
              {lockLoading ? "…" : isLocked ? "Freigeben" : "Sperren"}
            </button>
            {isLocked && (
              <p className="text-xs text-(--lab-text-secondary) mt-2 font-mono truncate">
                Sitzung: {sessionId?.slice(0, 8)}…
              </p>
            )}
            {lockError && (
              <p className="text-xs text-(--lab-danger) mt-1">{lockError}</p>
            )}
          </div>

          {/* Acquisition */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-(--lab-text-secondary) uppercase">
              Aufnahme
            </h3>
            <button
              onClick={handleRun}
              disabled={!canCommand}
              aria-label={
                isRunning
                  ? "Läuft (kontinuierlich)"
                  : "Kontinuierliche Messung starten"
              }
              title={
                isRunning
                  ? "Kontinuierliche Messung läuft (~1 Hz)"
                  : "Kontinuierliche Messung starten (~1 Hz) — stoppt mit STOPP"
              }
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 border-2 rounded font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isRunning
                  ? "bg-(--lab-success) border-(--lab-success) text-white"
                  : "bg-white border-(--lab-success) text-(--lab-success) hover:bg-(--lab-success) hover:text-white"
              }`}
            >
              <Play className="w-5 h-5" />
              {isRunning ? "LÄUFT" : "START"}
            </button>

            <button
              onClick={handleStop}
              disabled={!canCommand}
              aria-label="Messung stoppen"
              title="Messung anhalten — letztes Signal bleibt sichtbar"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 rounded font-semibold bg-white border-(--lab-danger) text-(--lab-danger) hover:bg-(--lab-danger) hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Square className="w-5 h-5" />
              STOPP
            </button>
            {expertMode && (
              <>
                <button
                  onClick={() =>
                    withCmdError(async () => {
                      await stopDevice(token!, deviceId!, sessionId!);
                      setIsRunning(false);
                    })
                  }
                  disabled={!canCommand}
                  title="Einzelmessung: stoppt nach einer Aufnahme"
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-border) text-(--lab-text-primary) hover:bg-(--lab-panel) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  EINZEL
                </button>
                <button
                  onClick={() =>
                    withCmdError(async () => {
                      await stopDevice(token!, deviceId!, sessionId!);
                      await runDevice(token!, deviceId!, sessionId!);
                    })
                  }
                  disabled={!canCommand}
                  title="Stoppt und startet neu — löst sofort einen Trigger aus"
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-border) text-(--lab-text-primary) hover:bg-(--lab-panel) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Zap className="w-4 h-4" />
                  Trigger erzwingen
                </button>
              </>
            )}
          </div>

          {/* Acquire */}
          <div className="space-y-2">
            <button
              onClick={() => handleAcquire(false)}
              disabled={!canCommand || isAcquiring}
              title="Einzelmessung durchführen und Wellenformdaten abrufen"
              className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-accent) text-(--lab-accent) hover:bg-(--lab-accent) hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isAcquiring ? "Messen…" : "MESSEN"}
            </button>

            {/* Annotation input — shown after each acquisition */}
            {lastAcquisitionId && (
              <div className="space-y-1 pt-1">
                <label className="block text-xs text-(--lab-text-secondary)">
                  Beschriftung
                </label>
                <input
                  type="text"
                  value={annotationText}
                  onChange={(e) => {
                    setAnnotationText(e.target.value);
                    setAnnotationSaved(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveAnnotation();
                  }}
                  placeholder="Messung beschriften…"
                  title="Freitextbeschriftung für diese Aufnahme — wird im Datenarchiv angezeigt"
                  className="w-full border-2 border-(--lab-border) rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-(--lab-accent)"
                />
                <button
                  onClick={handleSaveAnnotation}
                  disabled={
                    !annotationText.trim() ||
                    isSavingAnnotation ||
                    annotationSaved
                  }
                  className="w-full py-1 px-2 border-2 rounded text-xs font-medium transition-colors border-(--lab-border) text-(--lab-text-secondary) hover:bg-(--lab-panel) disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {annotationSaved
                    ? "Gespeichert"
                    : isSavingAnnotation
                      ? "Speichern…"
                      : "Speichern"}
                </button>
              </div>
            )}

            {/* MAX depth acquisition */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleAcquire(true)}
                  disabled={!canCommand || isAcquiringMax || isAcquiring}
                  title="Vollständigen Oszilloskopspeicher auslesen (MAX-Modus) — deutlich mehr Datenpunkte als MESSEN, dauert länger"
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-accent) text-(--lab-accent) hover:bg-(--lab-accent) hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isAcquiringMax ? "Lese Speicher…" : "TIEFENSPEICHER"}
                </button>
                <span
                  className="shrink-0 text-sm leading-none text-(--lab-text-secondary) cursor-help select-none"
                  title="MAX-Modus: Liest den vollständigen Oszilloskopspeicher blockweise aus. Liefert erheblich mehr Datenpunkte als eine normale Messung (je nach Speichertiefe bis zu mehreren Millionen). Dauert abhängig von der Speichertiefe 5–60 Sekunden."
                >
                  ⓘ
                </span>
              </div>
            </div>

            <button
              onClick={handleScreenshot}
              disabled={!canCommand || isScreenshotting}
              title="Screenshot vom Gerätedisplay aufnehmen und herunterladen"
              className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 rounded font-medium text-sm bg-white border-(--lab-border) text-(--lab-text-primary) hover:bg-(--lab-panel) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isScreenshotting ? (
                <span className="w-4 h-4 border-2 border-(--lab-text-secondary) border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
              {isScreenshotting ? "Aufnehmen…" : "Screenshot"}
            </button>
          </div>

          {cmdError && (
            <p className="text-xs text-(--lab-danger) wrap-break-word">
              {cmdError}
            </p>
          )}
        </aside>

        {/* Center — waveform */}
        <main className="flex-1 flex flex-col p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-(--lab-text-secondary)">
              Signaldarstellung
            </h2>
            <div className="flex items-center gap-2">
              <button
                title="Wellenformdaten als CSV herunterladen"
                aria-label="Wellenformdaten als CSV herunterladen"
                onClick={handleDownloadCsv}
                disabled={!waveformData.length}
                className="p-1.5 border-2 border-(--lab-border) hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-(--lab-text-primary) disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
              </button>
              <span className="text-xs text-(--lab-text-secondary)">CSV</span>
            </div>
          </div>

          <div className="flex-1 relative">
            {waveformData.length === 0 ? (
              <div className="w-full h-full border-2 border-(--lab-border) rounded flex items-center justify-center">
                <p className="text-sm text-(--lab-text-secondary)">
                  {isLocked
                    ? isRunning
                      ? "Messung startet…"
                      : "START oder MESSEN drücken, um Messdaten zu erfassen"
                    : "Gerät sperren, um zu beginnen"}
                </p>
              </div>
            ) : (
              <WaveformPlot
                data={waveformData}
                enabledChannels={{
                  ch1: visibleChannels.has(1),
                  ch2: visibleChannels.has(2),
                  ch3: visibleChannels.has(3),
                  ch4: visibleChannels.has(4),
                }}
                channelScales={Object.fromEntries(
                  acquiredChannels.map((c) => [c.channel, c.scale_v_div]),
                )}
                triggerLevel={triggerSettings.level_v}
                triggerTime={timebaseSettings.offset_s}
                timebase={timebaseLabel}
                sampleRate={sampleRateLabel}
                memoryDepth={
                  currentDepth !== null
                    ? `Tiefe: ${formatMemoryDepth(currentDepth)}${maxDepth !== null && maxDepth !== currentDepth ? ` | Max: ${formatMemoryDepth(maxDepth)}` : ""}`
                    : undefined
                }
                timebaseScaleSDiv={actualTimebaseScaleSDiv}
              />
            )}
            {/* Live indicator */}
            {isRunning && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-white/80 px-2 py-0.5 rounded border border-(--lab-success) pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-(--lab-success) animate-pulse" />
                <span className="text-xs font-mono text-(--lab-success)">
                  LIVE
                </span>
              </div>
            )}
          </div>
        </main>

        {/* Right settings panel */}
        <aside className="w-50 bg-(--lab-panel) border-l-2 border-(--lab-border) flex flex-col">
          {/* Tab bar */}
          <div className="border-b-2 border-(--lab-border)">
            <div className="flex">
              {(
                [
                  ["channels", channelsDirty],
                  ...(expertMode
                    ? [
                        ["timebase", timebaseDirty],
                        ["trigger", triggerDirty],
                      ]
                    : []),
                ] as [string, boolean][]
              ).map(([tab, dirty]) => (
                <button
                  key={tab}
                  onClick={() =>
                    setActiveTab(tab as "channels" | "timebase" | "trigger")
                  }
                  className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                    activeTab === tab
                      ? "text-(--lab-text-primary) border-b-2 border-(--lab-accent)"
                      : "text-(--lab-text-secondary) hover:text-(--lab-text-primary)"
                  }`}
                >
                  {{
                    channels: "Kanäle",
                    timebase: "Zeitbasis",
                    trigger: "Trigger",
                  }[tab] ?? tab}
                  {dirty && isLocked && expertMode && (
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-(--lab-warning)" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === "channels" && (
              <ChannelsPanel
                channelSettings={channelSettings}
                setChannelSettings={setChannelSettings}
                isLocked={isLocked}
                applyingChannels={applyingChannels}
                channelsDirty={channelsDirty}
                onApply={handleApplyChannels}
                restrictedMode={!expertMode}
              />
            )}
            {activeTab === "timebase" && (
              <TimebasePanel
                timebaseSettings={timebaseSettings}
                setTimebaseSettings={setTimebaseSettings}
                isLocked={isLocked}
                applyingTimebase={applyingTimebase}
                timebaseDirty={timebaseDirty}
                onApply={handleApplyTimebase}
              />
            )}
            {activeTab === "trigger" && (
              <TriggerPanel
                triggerSettings={triggerSettings}
                setTriggerSettings={setTriggerSettings}
                isLocked={isLocked}
                applyingTrigger={applyingTrigger}
                triggerDirty={triggerDirty}
                onApply={handleApplyTrigger}
              />
            )}

            {applyError && (
              <p className="text-xs text-(--lab-danger) wrap-break-word">
                {applyError}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
