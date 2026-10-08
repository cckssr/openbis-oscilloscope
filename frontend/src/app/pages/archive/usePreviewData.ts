/** Loads the full-resolution traces of one capture for the preview. */
import { useCallback, useEffect, useState } from "react";
import { getArtifactWaveform } from "../../../api/sessions";
import { de } from "../../../i18n/de";
import { notifyError } from "../../../lib/notify";
import { tracesFromWaveforms, type Trace } from "../../../lib/trace";
import type { Capture } from "./groupArtifacts";

const MAX_CACHED = 12;
/** Small LRU so stepping back and forth with ←/→ doesn't refetch. */
const cache = new Map<string, Trace[]>();

function remember(key: string, traces: Trace[]): void {
  cache.delete(key);
  cache.set(key, traces);
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
}

export interface PreviewData {
  status: "idle" | "loading" | "ready" | "error";
  traces: Trace[];
  /** Fetches again after an error. */
  reload: () => void;
}

/**
 * Loads (and caches) the channel traces of a capture. Screenshots yield "idle".
 * Errors raise a toast and put the hook in the "error" state.
 * @param token - Bearer token
 * @param sessionId - Control session UUID
 * @param capture - Capture to show, or null when nothing is previewed
 * @returns Load status and traces (archive data only has partial channel configs, so no scales)
 */
export function usePreviewData(
  token: string | null,
  sessionId: string | undefined,
  capture: Capture | null,
): PreviewData {
  // Settled results only; "loading" is derived (no result for the current key yet).
  const [result, setResult] = useState<{ key: string; status: "ready" | "error"; traces: Trace[] } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const key =
    capture && capture.kind === "trace" && sessionId
      ? `${sessionId}:${capture.artifactIds.join(",")}`
      : "";
  const artifactIds = capture?.artifactIds;
  const cached = key ? cache.get(key) : undefined;

  useEffect(() => {
    if (!key || !token || !sessionId || !artifactIds) return;
    if (cache.has(key)) {
      remember(key, cache.get(key)!);
      return;
    }
    let cancelled = false;
    Promise.all(artifactIds.map((id) => getArtifactWaveform(token, sessionId, id)))
      .then((waveforms) => {
        // Archive data carries no channel settings → traces without scale (volts axis).
        const traces = tracesFromWaveforms(waveforms);
        remember(key, traces);
        if (!cancelled) setResult({ key, status: "ready", traces });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key, status: "error", traces: [] });
        notifyError(err, de.archive.preview.loadError, de.archive.preview.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [key, token, sessionId, artifactIds, attempt]);

  const reload = useCallback(() => {
    cache.delete(key);
    setResult(null);
    setAttempt((n) => n + 1);
  }, [key]);

  if (!key) return { status: "idle", traces: [], reload };
  if (cached) return { status: "ready", traces: cached, reload };
  if (result?.key === key) return { status: result.status, traces: result.traces, reload };
  return { status: "loading", traces: [], reload };
}
