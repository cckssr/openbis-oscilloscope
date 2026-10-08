/**
 * Fetches the screenshot artifacts of a session as object URLs for thumbnails
 * and the preview image, and revokes them on unmount.
 */
import { useEffect, useRef, useState } from "react";
import { fetchArtifactScreenshot } from "../../../api/sessions";
import type { Artifact } from "../../../api/types";

/**
 * Loads each screenshot once and exposes its object URL.
 * Failures are silent here: the row simply shows no thumbnail, and opening the
 * preview shows a dedicated error.
 * @param token - Bearer token
 * @param sessionId - Control session UUID
 * @param artifacts - All artifacts of the session
 * @returns Map artifact id → object URL for screenshots loaded so far
 */
export function useScreenshotUrls(
  token: string | null,
  sessionId: string | undefined,
  artifacts: Artifact[],
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());
  const created = useRef<string[]>([]);

  useEffect(() => {
    if (!token || !sessionId) return;
    for (const a of artifacts) {
      if (
        a.artifact_type !== "screenshot" ||
        requested.current.has(a.artifact_id)
      )
        continue;
      requested.current.add(a.artifact_id);
      fetchArtifactScreenshot(token, sessionId, a.artifact_id)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          created.current.push(url);
          setUrls((prev) => ({ ...prev, [a.artifact_id]: url }));
        })
        .catch(() => requested.current.delete(a.artifact_id));
    }
  }, [artifacts, token, sessionId]);

  useEffect(() => {
    const toRevoke = created.current;
    return () => toRevoke.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  return urls;
}
