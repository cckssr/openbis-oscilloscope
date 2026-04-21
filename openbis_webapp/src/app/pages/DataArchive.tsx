import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArtifactRow } from "../components/ArtifactRow";
import { WaveformPlot } from "../components/WaveformPlot";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../../api/client";
import {
  listArtifacts,
  flagArtifact,
  commitSession,
  getArtifactWaveform,
  fetchArtifactScreenshot,
} from "../../api/sessions";
import type { Artifact, WaveformData } from "../../api/types";
import { ArrowLeft, Upload, RefreshCw, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AcquisitionGroup {
  acquisition_id: string;
  annotation: string | null;
  traces: Artifact[];
  created_at: string;
  /** true if every trace in the group is persisted */
  persist: boolean;
}

interface PlotPoint {
  time: number;
  ch1?: number;
  ch2?: number;
  ch3?: number;
  ch4?: number;
}

// ---------------------------------------------------------------------------
// Waveform helpers (mirrors OscilloscopeControl)
// ---------------------------------------------------------------------------

function downsample(arr: number[], target: number): number[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  return Array.from({ length: target }, (_, i) => arr[Math.floor(i * step)]);
}

function buildPlotData(waveforms: WaveformData[]): PlotPoint[] {
  if (waveforms.length === 0) return [];
  const TARGET = 2000;
  const ref = waveforms[0];
  const times = downsample(ref.time_s, TARGET);
  return times.map((t, i) => {
    const pt: PlotPoint = { time: t };
    for (const w of waveforms) {
      const key = `ch${w.channel}` as keyof PlotPoint;
      const idx = Math.floor(i * (w.voltage_V.length / times.length));
      (pt as Record<string, number>)[key] = w.voltage_V[idx] ?? 0;
    }
    return pt;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatSampleRate(timeSeries: number[]): string {
  if (timeSeries.length < 2) return "—";
  const dt = timeSeries[1] - timeSeries[0];
  if (dt <= 0) return "—";
  const hz = 1 / dt;
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)} GSa/s`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MSa/s`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)} kSa/s`;
  return `${hz.toFixed(0)} Sa/s`;
}

function formatTimebase(timeSeries: number[]): string {
  if (timeSeries.length < 2) return "—";
  const span = timeSeries[timeSeries.length - 1] - timeSeries[0];
  const sDiv = span / 10;
  if (sDiv < 1e-6) return `${(sDiv * 1e9).toFixed(0)} ns/div`;
  if (sDiv < 1e-3) return `${(sDiv * 1e6).toFixed(0)} µs/div`;
  if (sDiv < 1) return `${(sDiv * 1e3).toFixed(0)} ms/div`;
  return `${sDiv.toFixed(2)} s/div`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataArchive() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Commit form
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [experimentId, setExperimentId] = useState("");
  const [sampleId, setSampleId] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Screenshot thumbnails: artifact_id → object URL
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});

  // Waveform preview
  const [previewGroup, setPreviewGroup] = useState<AcquisitionGroup | null>(null);
  const [previewPlotData, setPreviewPlotData] = useState<PlotPoint[]>([]);
  const [previewChannels, setPreviewChannels] = useState<{
    ch1: boolean; ch2: boolean; ch3: boolean; ch4: boolean;
  }>({ ch1: false, ch2: false, ch3: false, ch4: false });
  const [previewTimebaseScale, setPreviewTimebaseScale] = useState(1e-3);
  const [previewSampleRate, setPreviewSampleRate] = useState("—");
  const [previewTimebase, setPreviewTimebase] = useState("—");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Screenshot full-size preview
  const [previewScreenshotUrl, setPreviewScreenshotUrl] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const fetchArtifacts = useCallback(async () => {
    if (!token || !sessionId) return;
    setLoadError(null);
    try {
      const data = await listArtifacts(token, sessionId);
      setArtifacts(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load artifacts",
      );
    } finally {
      setIsLoading(false);
    }
  }, [token, sessionId]);

  useEffect(() => {
    fetchArtifacts();
  }, [fetchArtifacts]);

  // Fetch screenshot thumbnails whenever the artifact list changes
  useEffect(() => {
    if (!token || !sessionId) return;
    const screenshots = artifacts.filter((a) => a.artifact_type === "screenshot");
    for (const a of screenshots) {
      if (screenshotUrls[a.artifact_id]) continue;
      fetchArtifactScreenshot(token, sessionId, a.artifact_id)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          setScreenshotUrls((prev) => ({ ...prev, [a.artifact_id]: url }));
        })
        .catch(() => {});
    }
  }, [artifacts, token, sessionId]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(screenshotUrls).forEach(URL.revokeObjectURL);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Grouping
  // ---------------------------------------------------------------------------

  const { acquisitionGroups, screenshots, legacyTraces } = useMemo(() => {
    const groupMap = new Map<string, AcquisitionGroup>();
    const screenshotList: Artifact[] = [];
    const legacyList: Artifact[] = [];

    for (const a of artifacts) {
      if (a.artifact_type === "screenshot") {
        screenshotList.push(a);
      } else if (a.acquisition_id) {
        const existing = groupMap.get(a.acquisition_id);
        if (existing) {
          existing.traces.push(a);
          if (!a.persist) existing.persist = false;
          if (a.annotation && !existing.annotation) existing.annotation = a.annotation;
        } else {
          groupMap.set(a.acquisition_id, {
            acquisition_id: a.acquisition_id,
            annotation: a.annotation,
            traces: [a],
            created_at: a.created_at,
            persist: a.persist,
          });
        }
      } else {
        legacyList.push(a);
      }
    }

    // Sort traces within each group by channel number
    for (const g of groupMap.values()) {
      g.traces.sort((x, y) => (x.channel ?? 0) - (y.channel ?? 0));
    }

    return {
      acquisitionGroups: Array.from(groupMap.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
      screenshots: screenshotList,
      legacyTraces: legacyList,
    };
  }, [artifacts]);

  // All artifact IDs across all views (for select-all)
  const allArtifactIds = useMemo(
    () => artifacts.map((a) => a.artifact_id),
    [artifacts],
  );

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  const toggleSelect = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === allArtifactIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allArtifactIds));
    }
  };

  // ---------------------------------------------------------------------------
  // Flagging
  // ---------------------------------------------------------------------------

  const handleFlagIds = async (artifactIds: string[], persist: boolean) => {
    if (!token || !sessionId) return;
    try {
      await Promise.all(
        artifactIds.map((id) => flagArtifact(token, sessionId!, id, persist)),
      );
      setArtifacts((prev) =>
        prev.map((a) =>
          artifactIds.includes(a.artifact_id) ? { ...a, persist } : a,
        ),
      );
    } catch (err) {
      console.error("Flag failed:", err);
    }
  };

  // ---------------------------------------------------------------------------
  // Waveform preview
  // ---------------------------------------------------------------------------

  const handlePreviewGroup = async (group: AcquisitionGroup) => {
    if (!token || !sessionId) return;
    setPreviewGroup(group);
    setPreviewLoading(true);
    setPreviewPlotData([]);
    try {
      const results = await Promise.all(
        group.traces.map((t) =>
          getArtifactWaveform(token, sessionId!, t.artifact_id),
        ),
      );
      const plotData = buildPlotData(results);
      setPreviewPlotData(plotData);

      const enabledChs = { ch1: false, ch2: false, ch3: false, ch4: false };
      for (const t of group.traces) {
        if (t.channel) {
          enabledChs[`ch${t.channel}` as keyof typeof enabledChs] = true;
        }
      }
      setPreviewChannels(enabledChs);

      if (results.length > 0 && results[0].time_s.length >= 2) {
        const ts = results[0].time_s;
        const span = ts[ts.length - 1] - ts[0];
        setPreviewTimebaseScale(span / 10);
        setPreviewSampleRate(formatSampleRate(ts));
        setPreviewTimebase(formatTimebase(ts));
      }
    } catch (err) {
      console.error("Preview failed:", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewScreenshot = (artifactId: string) => {
    const url = screenshotUrls[artifactId];
    if (url) setPreviewScreenshotUrl(url);
  };

  // ---------------------------------------------------------------------------
  // Commit
  // ---------------------------------------------------------------------------

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !sessionId || !experimentId.trim()) return;
    setIsCommitting(true);
    setCommitError(null);
    setCommitResult(null);
    try {
      const res = await commitSession(
        token,
        sessionId,
        experimentId.trim(),
        sampleId.trim() || undefined,
      );
      setCommitResult(
        `Committed ${res.artifact_count} artifact(s) → ${res.permId}`,
      );
    } catch (err) {
      setCommitError(err instanceof ApiError ? err.message : "Commit failed");
    } finally {
      setIsCommitting(false);
    }
  };

  const flaggedCount = artifacts.filter((a) => a.persist).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-(--lab-bg) flex flex-col">
      <header className="bg-white border-b-2 border-(--lab-border) px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 border-2 border-(--lab-border) hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-(--lab-text-primary)"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-(--lab-text-primary)">
              Data Archive
            </h1>
            <p className="font-mono text-xs text-(--lab-text-secondary)">
              Session {sessionId}
            </p>
          </div>
        </div>

        <button
          onClick={fetchArtifacts}
          className="p-1.5 border-2 border-(--lab-border) hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-(--lab-text-primary) transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </header>

      {loadError && (
        <div className="mx-4 mt-4 px-4 py-3 border-2 border-(--lab-danger) rounded text-sm text-(--lab-danger) bg-white">
          {loadError}
        </div>
      )}

      {/* Artifact table */}
      <div className="flex-1 overflow-auto">
        {/* Column headers */}
        <div className="bg-(--lab-panel) border-b-2 border-(--lab-border)">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-4 py-2 text-xs font-medium text-(--lab-text-secondary) uppercase">
            <input
              type="checkbox"
              checked={
                allArtifactIds.length > 0 &&
                selected.size === allArtifactIds.length
              }
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-(--lab-accent)"
            />
            <div className="grid grid-cols-4 gap-4">
              <span>Timestamp</span>
              <span>Type</span>
              <span>Channels / Annotation</span>
              <span>Files</span>
            </div>
            <span>Flagged</span>
            <span>Actions</span>
          </div>
        </div>

        {!isLoading &&
          acquisitionGroups.length === 0 &&
          screenshots.length === 0 &&
          legacyTraces.length === 0 &&
          !loadError && (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-(--lab-text-secondary)">
                No artifacts yet. Use ACQUIRE on the control page.
              </p>
            </div>
          )}

        <div>
          {/* Grouped multi-channel acquisitions */}
          {acquisitionGroups.map((group) => {
            const traceIds = group.traces.map((t) => t.artifact_id);
            const channelLabel = group.traces
              .map((t) => `CH${t.channel}`)
              .join(", ");
            const totalFiles = group.traces.reduce(
              (sum, t) => sum + t.files.length,
              0,
            );
            const groupSelected = traceIds.every((id) => selected.has(id));

            return (
              <ArtifactRow
                key={group.acquisition_id}
                artifactId={group.acquisition_id}
                timestamp={formatTimestamp(group.created_at)}
                type="Waveform"
                channel={channelLabel}
                files={Array(totalFiles).fill("")}
                persist={group.persist}
                selected={groupSelected}
                onSelect={() => toggleSelect(traceIds)}
                onFlag={(persist) => handleFlagIds(traceIds, persist)}
                annotation={group.annotation}
                onPreview={() => handlePreviewGroup(group)}
              />
            );
          })}

          {/* Screenshots */}
          {screenshots.map((artifact) => (
            <ArtifactRow
              key={artifact.artifact_id}
              artifactId={artifact.artifact_id}
              timestamp={formatTimestamp(artifact.created_at)}
              type="Screenshot"
              files={artifact.files}
              persist={artifact.persist}
              selected={selected.has(artifact.artifact_id)}
              onSelect={() => toggleSelect([artifact.artifact_id])}
              onFlag={(persist) => handleFlagIds([artifact.artifact_id], persist)}
              thumbnailUrl={screenshotUrls[artifact.artifact_id]}
              onPreview={
                screenshotUrls[artifact.artifact_id]
                  ? () => handlePreviewScreenshot(artifact.artifact_id)
                  : undefined
              }
            />
          ))}

          {/* Legacy ungrouped traces */}
          {legacyTraces.map((artifact) => (
            <ArtifactRow
              key={artifact.artifact_id}
              artifactId={artifact.artifact_id}
              timestamp={formatTimestamp(artifact.created_at)}
              type="Waveform"
              channel={artifact.channel != null ? `CH${artifact.channel}` : undefined}
              files={artifact.files}
              persist={artifact.persist}
              selected={selected.has(artifact.artifact_id)}
              onSelect={() => toggleSelect([artifact.artifact_id])}
              onFlag={(persist) => handleFlagIds([artifact.artifact_id], persist)}
            />
          ))}
        </div>
      </div>

      {/* Commit panel */}
      <div className="border-t-2 border-(--lab-border) bg-white px-4 py-4">
        <div className="flex items-start gap-6">
          <div className="flex-1">
            <p className="text-sm font-medium text-(--lab-text-primary) mb-2">
              Commit to OpenBIS{" "}
              <span className="text-(--lab-text-secondary) font-normal">
                ({flaggedCount} artifact{flaggedCount !== 1 ? "s" : ""} flagged)
              </span>
            </p>
            <form onSubmit={handleCommit} className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-(--lab-text-secondary) mb-1">
                  Experiment ID *
                </label>
                <input
                  type="text"
                  value={experimentId}
                  onChange={(e) => setExperimentId(e.target.value)}
                  placeholder="/SPACE/PROJECT/EXPERIMENT"
                  required
                  className="w-full border-2 border-(--lab-border) rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-(--lab-accent)"
                />
              </div>
              <div className="w-48">
                <label className="block text-xs text-(--lab-text-secondary) mb-1">
                  Sample ID (optional)
                </label>
                <input
                  type="text"
                  value={sampleId}
                  onChange={(e) => setSampleId(e.target.value)}
                  placeholder="/SPACE/SAMPLE-ID"
                  className="w-full border-2 border-(--lab-border) rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-(--lab-accent)"
                />
              </div>
              <button
                type="submit"
                disabled={
                  isCommitting || flaggedCount === 0 || !experimentId.trim()
                }
                className="flex items-center gap-2 px-4 py-1.5 border-2 border-(--lab-accent) bg-white text-(--lab-accent) hover:bg-(--lab-accent) hover:text-white rounded font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                {isCommitting ? "Committing…" : "Commit"}
              </button>
            </form>
          </div>
        </div>

        {commitResult && (
          <p className="mt-2 text-xs text-(--lab-success) font-mono">
            {commitResult}
          </p>
        )}
        {commitError && (
          <p className="mt-2 text-xs text-(--lab-danger)">{commitError}</p>
        )}
      </div>

      {/* Waveform preview modal */}
      {previewGroup && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewGroup(null)}
        >
          <div
            className="bg-white rounded border-2 border-(--lab-border) w-full max-w-4xl h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b-2 border-(--lab-border)">
              <div>
                <span className="font-medium text-sm text-(--lab-text-primary)">
                  {previewGroup.traces.map((t) => `CH${t.channel}`).join(", ")}
                </span>
                <span className="ml-2 text-xs text-(--lab-text-secondary)">
                  {formatTimestamp(previewGroup.created_at)}
                </span>
                {previewGroup.annotation && (
                  <span className="ml-2 text-xs italic text-(--lab-text-secondary)">
                    — {previewGroup.annotation}
                  </span>
                )}
              </div>
              <button
                onClick={() => setPreviewGroup(null)}
                className="p-1 hover:bg-(--lab-panel) rounded text-(--lab-text-secondary)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 p-2">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full">
                  <span className="w-6 h-6 border-2 border-(--lab-accent) border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <WaveformPlot
                  data={previewPlotData}
                  enabledChannels={previewChannels}
                  timebase={previewTimebase}
                  sampleRate={previewSampleRate}
                  timebaseScaleSDiv={previewTimebaseScale}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Screenshot preview modal */}
      {previewScreenshotUrl && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewScreenshotUrl(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewScreenshotUrl(null)}
              className="absolute -top-3 -right-3 bg-white border-2 border-(--lab-border) rounded-full p-0.5 text-(--lab-text-secondary) hover:text-(--lab-text-primary)"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewScreenshotUrl}
              alt="Screenshot"
              className="max-w-[90vw] max-h-[85vh] rounded border-2 border-(--lab-border)"
            />
          </div>
        </div>
      )}
    </div>
  );
}
