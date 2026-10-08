import { useCallback, useEffect } from "react";
import { useBlocker, type Blocker } from "react-router";
import { useActionModel } from "../actions/session";

/**
 * Whether leaving the page would interrupt something: a full-resolution read
 * or a series is running. Live preview alone does not count (it just pauses).
 *
 * @param deviceId - The device
 * @returns true while a capture-like activity is running
 */
export function useCaptureRunning(deviceId: string): boolean {
  const model = useActionModel(deviceId);
  return model.fullResolution || model.seriesOn;
}

/**
 * Leave-page guard (review §4.1 item 4). While `active`:
 *
 * - in-app navigation to another path is blocked via react-router's
 *   `useBlocker` (the returned blocker drives {@link LeaveGuardDialog});
 * - closing or reloading the tab triggers the browser's `beforeunload`
 *   prompt. The session store soft-releases the lock on `pagehide` only (not
 *   on `beforeunload`), so staying after the prompt leaves the lock untouched
 *   while really leaving still releases it.
 *
 * @param active - Whether leaving should be confirmed
 * @returns The router blocker (`state === "blocked"` while the dialog should show)
 */
export function useLeaveGuard(active: boolean): Blocker {
  const shouldBlock = useCallback(
    ({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
    [active],
  );
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);

  return blocker;
}
