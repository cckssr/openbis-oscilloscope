/** Looks up the device and activity of the opened session via "Meine Messdaten". */
import { useEffect, useState } from "react";
import { listMySessions } from "../../../api/sessions";
import type { SessionSummary } from "../../../api/types";

/**
 * Finds the summary of one session in the user's session list. Stays null when
 * the session is not the caller's (e.g. an admin looking at someone else's data)
 * or the list cannot be loaded — the page works without it.
 * @param token - Bearer token
 * @param sessionId - Control session UUID
 * @returns The summary, or null while unknown
 */
export function useSessionInfo(
  token: string | null,
  sessionId: string | undefined,
): SessionSummary | null {
  const [info, setInfo] = useState<SessionSummary | null>(null);
  useEffect(() => {
    if (!token || !sessionId) return;
    let alive = true;
    listMySessions(token)
      .then((list) => alive && setInfo(list.find((s) => s.session_id === sessionId) ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, sessionId]);
  return info;
}
