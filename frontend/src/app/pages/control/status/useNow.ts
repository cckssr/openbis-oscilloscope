import { useEffect, useState } from "react";

/**
 * Current time (ms since epoch), refreshed on a local timer so only the
 * calling component re-renders (not the store).
 * @param intervalMs - Refresh interval
 * @param active - false stops the timer
 * @returns `Date.now()` as of the last tick
 */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}
