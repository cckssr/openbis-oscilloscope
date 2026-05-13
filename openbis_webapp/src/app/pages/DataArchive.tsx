import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import JSZip from "jszip";
import { ArtifactRow } from "../components/ArtifactRow";
import { WaveformPlot } from "../components/WaveformPlot";
import { OpenBISObjectSelector } from "../components/OpenBISObjectSelector";
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
import {
  ArrowLeft,
  Upload,
  RefreshCw,
  X,
  Download,
  ChevronDown,
  ChevronRight,
  Trash2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AcquisitionGroup {
  acquisition_id: string;
  annotation: string | null;
  traces: Artifact[];
  created_at: string;
  persist: boolean;
  run_id: string | null;
}

interface RunGroup {
  run_id: string;
  run_nr: number;
  acquisitions: AcquisitionGroup[];
  created_at: string;
}

interface PlotPoint {
  time: number;
  ch1?: number;
  ch2?: number;
  ch3?: number;
  ch4?: number;
}

// ---------------------------------------------------------------------------
// Waveform helpers
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

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Commit form
  const [experimentId, setExperimentId] = useState("");
  const [sampleId, setSampleId] = useState("");
  const [labCourse, setLabCourse] = useState("");
  const [expTitle, setExpTitle] = useState("");
  const [groupName, setGroupName] = useState("");
  const [semester, setSemester] = useState("");
  const [expDescription, setExpDescription] = useState("");
  const [deviceUnderTest, setDeviceUnderTest] = useState("");
  const [notes, setNotes] = useState("");
  const [showCommitForm, setShowCommitForm] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Track whether the current experiment/sample values came from the dropdown
  const [dropdownFilled, setDropdownFilled] = useState(false);
  // Increment to force-remount the selector (clears its internal state)
  const [selectorKey, setSelectorKey] = useState(0);

  // Download
  const [isDownloading, setIsDownloading] = useState(false);

  // Screenshot thumbnails
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>(
    {},
  );

  // Waveform preview
  const [previewGroup, setPreviewGroup] = useState<AcquisitionGroup | null>(
    null,
  );
  const [previewPlotData, setPreviewPlotData] = useState<PlotPoint[]>([]);
  const [previewChannels, setPreviewChannels] = useState<{
    ch1: boolean;
    ch2: boolean;
    ch3: boolean;
    ch4: boolean;
  }>({ ch1: false, ch2: false, ch3: false, ch4: false });
  const [previewTimebaseScale, setPreviewTimebaseScale] = useState(1e-3);
  const [previewSampleRate, setPreviewSampleRate] = useState("—");
  const [previewTimebase, setPreviewTimebase] = useState("—");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Screenshot full-size preview
  const [previewScreenshotUrl, setPreviewScreenshotUrl] = useState<
    string | null
  >(null);

  // Run group collapse state (all collapsed by default)
  const [collapsedRuns, setCollapsedRuns] = useState<Set<string>>(new Set());
  const runGroupsInitialized = useRef(false);

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
        err instanceof Error
          ? err.message
          : "Artefakte konnten nicht geladen werden",
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
    const screenshots = artifacts.filter(
      (a) => a.artifact_type === "screenshot",
    );
    for (const a of screenshots) {
      if (screenshotUrls[a.artifact_id]) continue;
      fetchArtifactScreenshot(token, sessionId, a.artifact_id)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          setScreenshotUrls((prev) => ({ ...prev, [a.artifact_id]: url }));
        })
        .catch(() => {});
    }
  }, [artifacts, token, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      Object.values(screenshotUrls).forEach(URL.revokeObjectURL);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Grouping
  // ---------------------------------------------------------------------------

  const { runGroups, ungroupedAcquisitions, screenshots, legacyTraces } =
    useMemo(() => {
      const acqMap = new Map<string, AcquisitionGroup>();
      const screenshotList: Artifact[] = [];
      const legacyList: Artifact[] = [];

      for (const a of artifacts) {
        if (a.artifact_type === "screenshot") {
          screenshotList.push(a);
        } else if (a.acquisition_id) {
          const existing = acqMap.get(a.acquisition_id);
          if (existing) {
            existing.traces.push(a);
            if (!a.persist) existing.persist = false;
            if (a.annotation && !existing.annotation)
              existing.annotation = a.annotation;
          } else {
            acqMap.set(a.acquisition_id, {
              acquisition_id: a.acquisition_id,
              annotation: a.annotation,
              traces: [a],
              created_at: a.created_at,
              persist: a.persist,
              run_id: a.run_id ?? null,
            });
          }
        } else {
          legacyList.push(a);
        }
      }

      for (const g of acqMap.values()) {
        g.traces.sort((x, y) => (x.channel ?? 0) - (y.channel ?? 0));
      }

      const sortedAcqs = Array.from(acqMap.values()).sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      const runMap = new Map<string, RunGroup>();
      const ungrouped: AcquisitionGroup[] = [];
      let runCounter = 1;

      for (const acq of sortedAcqs) {
        if (!acq.run_id) {
          ungrouped.push(acq);
        } else {
          if (!runMap.has(acq.run_id)) {
            runMap.set(acq.run_id, {
              run_id: acq.run_id,
              run_nr: runCounter++,
              acquisitions: [],
              created_at: acq.created_at,
            });
          }
          runMap.get(acq.run_id)!.acquisitions.push(acq);
        }
      }

      return {
        runGroups: Array.from(runMap.values()),
        ungroupedAcquisitions: ungrouped,
        screenshots: screenshotList,
        legacyTraces: legacyList,
      };
    }, [artifacts]);

  // Collapse all run groups on first load
  useEffect(() => {
    if (!runGroupsInitialized.current && runGroups.length > 0) {
      setCollapsedRuns(new Set(runGroups.map((r) => r.run_id)));
      runGroupsInitialized.current = true;
    }
  }, [runGroups]);

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
      const allSel = ids.every((id) => next.has(id));
      if (allSel) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === allArtifactIds.length) setSelected(new Set());
    else setSelected(new Set(allArtifactIds));
  };

  const selectFlagged = () => {
    setSelected(
      new Set(artifacts.filter((a) => a.persist).map((a) => a.artifact_id)),
    );
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
      setPreviewPlotData(buildPlotData(results));

      const enabledChs = { ch1: false, ch2: false, ch3: false, ch4: false };
      for (const t of group.traces) {
        if (t.channel)
          enabledChs[`ch${t.channel}` as keyof typeof enabledChs] = true;
      }
      setPreviewChannels(enabledChs);

      if (results.length > 0 && results[0].time_s.length >= 2) {
        const ts = results[0].time_s;
        setPreviewTimebaseScale((ts[ts.length - 1] - ts[0]) / 10);
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
  // Download ZIP
  // ---------------------------------------------------------------------------

  const handleDownloadSelected = async () => {
    if (!token || !sessionId) return;
    const selectedArtifacts = artifacts.filter((a) =>
      selected.has(a.artifact_id),
    );
    if (selectedArtifacts.length > 50) {
      alert(
        "Maximal 50 Elemente gleichzeitig herunterladen. Bitte Auswahl reduzieren.",
      );
      return;
    }
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const traces = selectedArtifacts.filter(
        (a) => a.artifact_type === "trace",
      );
      const shots = selectedArtifacts.filter(
        (a) => a.artifact_type === "screenshot",
      );

      await Promise.all(
        traces.map(async (a) => {
          const data = await getArtifactWaveform(
            token,
            sessionId!,
            a.artifact_id,
          );
          const rows = data.time_s.map((t, i) => `${t},${data.voltage_V[i]}`);
          zip.file(
            `${a.acquisition_id ?? a.artifact_id}_ch${a.channel}.csv`,
            ["time_s,voltage_V", ...rows].join("\n"),
          );
        }),
      );

      await Promise.all(
        shots.map(async (a) => {
          const blob = await fetchArtifactScreenshot(
            token,
            sessionId!,
            a.artifact_id,
          );
          zip.file(`screenshot_${a.artifact_id}.png`, blob);
        }),
      );

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `waveforms_${sessionId?.slice(0, 8)}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Commit
  // ---------------------------------------------------------------------------

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !sessionId) return;
    setIsCommitting(true);
    setCommitError(null);
    setCommitResult(null);
    try {
      const res = await commitSession(token, sessionId, {
        experiment_id: experimentId.trim(),
        sample_id: sampleId.trim() || undefined,
        lab_course: labCourse || undefined,
        exp_title: expTitle.trim() || undefined,
        group_name: groupName.trim() || undefined,
        semester: semester.trim() || undefined,
        exp_description: expDescription.trim() || undefined,
        device_under_test: deviceUnderTest.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setCommitResult(
        `${res.artifact_count} Artefakt(e) übertragen → ${res.permId}`,
      );
    } catch (err) {
      setCommitError(
        err instanceof ApiError ? err.message : "Übertragung fehlgeschlagen",
      );
    } finally {
      setIsCommitting(false);
    }
  };

  const handleClearForm = () => {
    setExperimentId("");
    setSampleId("");
    setLabCourse("");
    setExpTitle("");
    setGroupName("");
    setSemester("");
    setExpDescription("");
    setDeviceUnderTest("");
    setNotes("");
    setDropdownFilled(false);
    setSelectorKey((k) => k + 1);
    setCommitResult(null);
    setCommitError(null);
  };

  const flaggedCount = artifacts.filter((a) => a.persist).length;

  const inputClass =
    "w-full border-2 border-(--lab-border) rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-(--lab-accent)";

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderAcquisitionGroup = (group: AcquisitionGroup) => {
    const traceIds = group.traces.map((t) => t.artifact_id);
    const channelLabel = group.traces.map((t) => `CH${t.channel}`).join(", ");
    const totalFiles = group.traces.reduce((sum, t) => sum + t.files.length, 0);
    const groupSelected = traceIds.every((id) => selected.has(id));

    return (
      <ArtifactRow
        key={group.acquisition_id}
        artifactId={group.acquisition_id}
        timestamp={formatTimestamp(group.created_at)}
        type="Wellenform"
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
  };

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
              Datenarchiv
            </h1>
            <p className="font-mono text-xs text-(--lab-text-secondary)">
              Sitzung {sessionId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={handleDownloadSelected}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-(--lab-border) hover:bg-(--lab-panel) rounded text-sm text-(--lab-text-secondary) transition-colors disabled:opacity-40"
              title={
                selected.size > 50
                  ? "Maximal 50 Elemente"
                  : "Als ZIP herunterladen"
              }
            >
              <Download className="w-4 h-4" />
              {isDownloading ? "ZIP…" : `Herunterladen (${selected.size})`}
            </button>
          )}
          <button
            onClick={fetchArtifacts}
            className="p-1.5 border-2 border-(--lab-border) hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-(--lab-text-primary) transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={
                  allArtifactIds.length > 0 &&
                  selected.size === allArtifactIds.length
                }
                onChange={toggleSelectAll}
                className="w-4 h-4 accent-(--lab-accent)"
              />
              {artifacts.some((a) => a.persist) && (
                <button
                  onClick={selectFlagged}
                  className="text-[10px] normal-case text-(--lab-warning) hover:underline whitespace-nowrap"
                  title="Alle markierten Artefakte auswählen"
                >
                  Markiert
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-4">
              <span>Zeitstempel</span>
              <span>Typ</span>
              <span>Kanal / Beschriftung</span>
              <span>Dateien</span>
            </div>
            <span />
            <span>Aktionen</span>
          </div>
        </div>

        {!isLoading &&
          runGroups.length === 0 &&
          ungroupedAcquisitions.length === 0 &&
          screenshots.length === 0 &&
          legacyTraces.length === 0 &&
          !loadError && (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-(--lab-text-secondary)">
                Noch keine Daten. MESSEN auf der Steuerungsseite verwenden.
              </p>
            </div>
          )}

        <div>
          {/* Run groups */}
          {runGroups.map((rg) => {
            const isCollapsed = collapsedRuns.has(rg.run_id);
            const allRunArtifactIds = rg.acquisitions.flatMap((g) =>
              g.traces.map((t) => t.artifact_id),
            );
            const runSelected = allRunArtifactIds.every((id) =>
              selected.has(id),
            );
            const runPartial =
              !runSelected && allRunArtifactIds.some((id) => selected.has(id));
            const acqCount = rg.acquisitions.length;
            const artifactCount = allRunArtifactIds.length;

            return (
              <div key={rg.run_id}>
                {/* Run group header */}
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-4 py-2 bg-(--lab-panel) border-b-2 border-(--lab-border)">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={runSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = runPartial;
                      }}
                      onChange={() => toggleSelect(allRunArtifactIds)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 accent-(--lab-accent)"
                    />
                  </div>
                  <button
                    className="flex items-center gap-2 text-left"
                    onClick={() =>
                      setCollapsedRuns((prev) => {
                        const next = new Set(prev);
                        if (next.has(rg.run_id)) next.delete(rg.run_id);
                        else next.add(rg.run_id);
                        return next;
                      })
                    }
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-(--lab-text-secondary)" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-(--lab-text-secondary)" />
                    )}
                    <span className="font-medium text-sm text-(--lab-text-primary)">
                      Messung {rg.run_nr}
                    </span>
                    <span className="font-mono text-xs text-(--lab-text-secondary)">
                      {formatTimestamp(rg.created_at)} · {acqCount} Aufnahme
                      {acqCount !== 1 ? "n" : ""} · {artifactCount} Spur
                      {artifactCount !== 1 ? "en" : ""}
                    </span>
                  </button>
                  <span />
                  <span />
                </div>

                {/* Run acquisitions — visually indented under their run group */}
                {!isCollapsed && rg.acquisitions.length > 0 && (
                  <div
                    style={{
                      borderLeft: "3px solid var(--lab-accent)",
                      marginLeft: "1.5rem",
                      background: "var(--lab-bg)",
                    }}
                  >
                    {rg.acquisitions.map((group) =>
                      renderAcquisitionGroup(group),
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Ungrouped acquisitions */}
          {ungroupedAcquisitions.map((group) => renderAcquisitionGroup(group))}

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
              onFlag={(persist) =>
                handleFlagIds([artifact.artifact_id], persist)
              }
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
              type="Wellenform"
              channel={
                artifact.channel != null ? `CH${artifact.channel}` : undefined
              }
              files={artifact.files}
              persist={artifact.persist}
              selected={selected.has(artifact.artifact_id)}
              onSelect={() => toggleSelect([artifact.artifact_id])}
              onFlag={(persist) =>
                handleFlagIds([artifact.artifact_id], persist)
              }
            />
          ))}
        </div>
      </div>

      {/* Commit panel */}
      <div className="border-t-2 border-(--lab-border) bg-white px-4 py-3">
        {/* Panel header */}
        <button
          onClick={() => setShowCommitForm((v) => !v)}
          className="w-full flex items-center justify-between text-sm font-medium text-(--lab-text-primary) hover:text-(--lab-accent) transition-colors"
        >
          <span>
            Zu OpenBIS übertragen{" "}
            <span className="text-(--lab-text-secondary) font-normal">
              ({flaggedCount} Artefakt{flaggedCount !== 1 ? "e" : ""} markiert)
            </span>
          </span>
          {showCommitForm ? (
            <ChevronDown className="w-4 h-4 text-(--lab-text-secondary)" />
          ) : (
            <ChevronRight className="w-4 h-4 text-(--lab-text-secondary)" />
          )}
        </button>

        {showCommitForm && (
          <form onSubmit={handleCommit} className="mt-4 flex flex-col gap-4">
            {/* Upload target — either dropdown OR manual entry */}
            <div className="border-2 border-(--lab-border) rounded p-3 flex flex-col gap-3">
              <p className="text-xs text-(--lab-text-secondary)">
                <span className="font-medium text-(--lab-text-primary)">
                  Upload-Ziel:
                </span>{" "}
                Wähle über die Dropdowns (Gruppe → Sammlung, Objekt optional)
                <span className="mx-1 text-(--lab-text-secondary)">—oder—</span>
                gib Sammlung-/Objekt-Kennung direkt ein. Beides gleichzeitig ist
                nicht möglich.
              </p>

              {/* Dropdown selector — disabled when manual fields have content */}
              {token && (
                <OpenBISObjectSelector
                  key={selectorKey}
                  token={token}
                  disabled={
                    !dropdownFilled &&
                    (experimentId.trim() !== "" || sampleId.trim() !== "")
                  }
                  onSelect={({
                    experimentId: eid,
                    sampleId: sid,
                    groupName: gn,
                    semester: sem,
                  }) => {
                    setExperimentId(eid);
                    setSampleId(sid);
                    setGroupName(gn);
                    setSemester(sem);
                    setDropdownFilled(eid !== "");
                  }}
                />
              )}

              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 border-t border-(--lab-border)" />
                <span className="text-xs text-(--lab-text-secondary)">
                  oder manuell
                </span>
                <div className="flex-1 border-t border-(--lab-border)" />
              </div>

              {/* Manual entry — disabled when dropdown filled */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-1">
                    Sammlung-ID *{" "}
                    <span className="italic font-normal">(Upload-Ziel)</span>
                  </label>
                  <input
                    type="text"
                    value={experimentId}
                    onChange={(e) => {
                      setExperimentId(e.target.value);
                      if (dropdownFilled) {
                        setDropdownFilled(false);
                        setSelectorKey((k) => k + 1);
                      }
                    }}
                    placeholder="/SPACE/PROJECT/EXPERIMENT"
                    disabled={dropdownFilled}
                    title="OpenBIS-Sammlungspfad, z.B. /MY_SPACE/PROJECT/EXP-1 — Pflichtfeld"
                    className={`${inputClass} disabled:bg-(--lab-panel) disabled:cursor-default`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-1">
                    Objekt-ID{" "}
                    <span className="italic font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={sampleId}
                    onChange={(e) => {
                      setSampleId(e.target.value);
                      if (dropdownFilled) {
                        setDropdownFilled(false);
                        setSelectorKey((k) => k + 1);
                      }
                    }}
                    placeholder="/SPACE/SAMPLE"
                    disabled={dropdownFilled}
                    title="OpenBIS-Objekt-/Proben-Kennung — optional, wenn leer wird zur Sammlung hochgeladen"
                    className={`${inputClass} disabled:bg-(--lab-panel) disabled:cursor-default`}
                  />
                </div>
              </div>

              {/* Auto-populated metadata from dropdown (read-only) */}
              {(groupName || semester) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-(--lab-text-secondary) mb-1">
                      Gruppe <span className="italic">(aus Auswahl)</span>
                    </label>
                    <input
                      type="text"
                      value={groupName}
                      readOnly
                      className={`${inputClass} bg-(--lab-panel) cursor-default`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-(--lab-text-secondary) mb-1">
                      Semester <span className="italic">(aus Auswahl)</span>
                    </label>
                    <input
                      type="text"
                      value={semester}
                      readOnly
                      className={`${inputClass} bg-(--lab-panel) cursor-default`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Row: Lab course + Exp title */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-(--lab-text-secondary) mb-1">
                  Praktikum *
                </label>
                <select
                  value={labCourse}
                  onChange={(e) => setLabCourse(e.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="">— Auswählen —</option>
                  <option value="GP1">GP1</option>
                  <option value="GP2">GP2</option>
                  <option value="GP3">GP3</option>
                  <option value="Projektlabor">Projektlabor</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-(--lab-text-secondary) mb-1">
                  DSO-Versuchstitel *
                </label>
                <input
                  type="text"
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="z.B. RC-Schaltung Frequenzgang"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            {/* Row: Description */}
            <div>
              <label className="block text-xs text-(--lab-text-secondary) mb-1">
                DSO-Versuchsbeschreibung
              </label>
              <textarea
                value={expDescription}
                onChange={(e) => setExpDescription(e.target.value)}
                placeholder="Optionale Beschreibung des Versuchs"
                rows={2}
                className={inputClass}
              />
            </div>

            {/* Row: Device under test + Notes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-(--lab-text-secondary) mb-1">
                  Messobjekt
                </label>
                <input
                  type="text"
                  value={deviceUnderTest}
                  onChange={(e) => setDeviceUnderTest(e.target.value)}
                  placeholder="z.B. RC-Filter, Op-Amp LM741"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-(--lab-text-secondary) mb-1">
                  Notizen
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optionale Notizen"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Submit row */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="submit"
                disabled={
                  isCommitting ||
                  flaggedCount === 0 ||
                  !experimentId.trim() ||
                  !labCourse ||
                  !expTitle.trim()
                }
                className="flex items-center gap-2 px-4 py-1.5 border-2 border-(--lab-accent) bg-white text-(--lab-accent) hover:bg-(--lab-accent) hover:text-white rounded font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                {isCommitting ? "Übertragen…" : "Übertragen"}
              </button>
              <button
                type="button"
                onClick={handleClearForm}
                className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-(--lab-border) bg-white text-(--lab-text-secondary) hover:bg-(--lab-panel) rounded text-sm transition-colors"
                title="Alle Formularfelder zurücksetzen"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Alles löschen
              </button>
              {flaggedCount === 0 && (
                <span className="text-xs text-(--lab-text-secondary)">
                  Artefakte zuerst mit dem Markierungs-Button kennzeichnen
                </span>
              )}
            </div>
          </form>
        )}

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
