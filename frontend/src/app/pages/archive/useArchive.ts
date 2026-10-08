/**
 * Data hook of the archive page: loads the artifact list and performs the
 * optimistic mutations (upload selection, notes) with rollback + toast.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { flagArtifact, listArtifacts, setAnnotation } from "../../../api/sessions";
import type { Artifact } from "../../../api/types";
import { de } from "../../../i18n/de";
import { notifyError } from "../../../lib/notify";
import {
  restorePersist,
  withAnnotation,
  withPersist,
  type Capture,
} from "./groupArtifacts";

const t = de.archive;

export interface ArchiveData {
  artifacts: Artifact[];
  /** true until the first load finished (successfully or not). */
  isLoading: boolean;
  /** true while any (re)load is in flight. */
  isRefreshing: boolean;
  /** Re-reads the artifact list from the server. */
  refresh: () => Promise<void>;
  /**
   * Selects or deselects captures for the next upload (optimistic).
   * On error the previous state is restored, the list is re-synced and a toast is shown.
   */
  setUploadSelection: (captures: Capture[], wanted: boolean) => Promise<void>;
  /** Saves a note on a capture (optimistic, rolled back with a toast on error). */
  saveNote: (capture: Capture, text: string) => Promise<void>;
}

/**
 * Loads and mutates the artifacts of one session.
 * @param token - Bearer token
 * @param sessionId - Control session UUID
 * @returns The artifacts plus loading state and mutation helpers
 */
export function useArchive(token: string | null, sessionId: string | undefined): ArchiveData {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback((): Promise<void> => {
    if (!token || !sessionId) return Promise.resolve();
    return listArtifacts(token, sessionId)
      .then((data) => {
        if (alive.current) setArtifacts(data);
      })
      .catch((err) => notifyError(err, t.loadError, t.loadError))
      .finally(() => {
        if (alive.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      });
  }, [token, sessionId]);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    return load();
  }, [load]);

  // Initial load; `load` sets state only after the request resolved.
  useEffect(() => {
    void load();
  }, [load]);

  const setUploadSelection = useCallback(
    async (captures: Capture[], wanted: boolean) => {
      if (!token || !sessionId || captures.length === 0) return;
      const ids = captures.flatMap((c) => c.artifactIds);
      const previous = new Map<string, boolean>();
      for (const c of captures) for (const a of c.artifacts) previous.set(a.artifact_id, a.persist);
      setArtifacts((prev) => withPersist(prev, ids, wanted));
      const results = await Promise.allSettled(
        ids.map((id) => flagArtifact(token, sessionId, id, wanted)),
      );
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) {
        if (alive.current) setArtifacts((prev) => restorePersist(prev, previous));
        notifyError(failed.reason, t.select.flagErrorText, t.select.flagError);
        // Some requests may have succeeded: re-sync with the server's truth.
        await refresh();
      }
    },
    [token, sessionId, refresh],
  );

  const saveNote = useCallback(
    async (capture: Capture, text: string) => {
      if (!token || !sessionId || !capture.acquisitionId) return;
      const acquisitionId = capture.acquisitionId;
      const before = capture.annotation ?? "";
      const next = text.trim();
      if (next === before) return;
      setArtifacts((prev) => withAnnotation(prev, acquisitionId, next));
      try {
        await setAnnotation(token, sessionId, acquisitionId, next);
      } catch (err) {
        if (alive.current) setArtifacts((prev) => withAnnotation(prev, acquisitionId, before));
        notifyError(err, t.note.saveErrorText, t.note.saveError);
      }
    },
    [token, sessionId],
  );

  return { artifacts, isLoading, isRefreshing, refresh, setUploadSelection, saveNote };
}
