import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArtifactRow } from "../components/ArtifactRow";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../../api/client";
import { listArtifacts, flagArtifact, commitSession } from "../../api/sessions";
import type { Artifact } from "../../api/types";
import { ArrowLeft, Upload, RefreshCw } from "lucide-react";

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function artifactLabel(a: Artifact): string {
  return a.artifact_type === "trace" ? "Waveform" : "Screenshot";
}

function channelLabel(a: Artifact): string | undefined {
  return a.channel != null ? `CH${a.channel}` : undefined;
}

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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === artifacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(artifacts.map((a) => a.artifact_id)));
    }
  };

  const handleFlag = async (artifactId: string, persist: boolean) => {
    if (!token || !sessionId) return;
    try {
      await flagArtifact(token, sessionId, artifactId, persist);
      setArtifacts((prev) =>
        prev.map((a) => (a.artifact_id === artifactId ? { ...a, persist } : a)),
      );
    } catch (err) {
      // Silently ignore; the flag state won't change locally
      console.error("Flag failed:", err);
    }
  };

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
        <div className="bg-(--lab-panel) border-b-2 border-(--lab-border)">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-4 py-2 text-xs font-medium text-(--lab-text-secondary) uppercase">
            <input
              type="checkbox"
              checked={
                artifacts.length > 0 && selected.size === artifacts.length
              }
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-(--lab-accent)"
            />
            <div className="grid grid-cols-4 gap-4">
              <span>Timestamp</span>
              <span>Type</span>
              <span>Channel</span>
              <span>Files</span>
            </div>
            <span>Flagged</span>
            <span>Actions</span>
          </div>
        </div>

        {!isLoading && artifacts.length === 0 && !loadError && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-(--lab-text-secondary)">
              No artifacts yet. Use ACQUIRE on the control page.
            </p>
          </div>
        )}

        <div>
          {artifacts.map((artifact) => (
            <ArtifactRow
              key={artifact.artifact_id}
              artifactId={artifact.artifact_id}
              timestamp={formatTimestamp(artifact.created_at)}
              type={artifactLabel(artifact)}
              channel={channelLabel(artifact)}
              files={artifact.files}
              persist={artifact.persist}
              selected={selected.has(artifact.artifact_id)}
              onSelect={() => toggleSelect(artifact.artifact_id)}
              onFlag={(persist) => handleFlag(artifact.artifact_id, persist)}
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
    </div>
  );
}
