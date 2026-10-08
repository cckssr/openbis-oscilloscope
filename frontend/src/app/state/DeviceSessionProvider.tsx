import type { ReactNode } from "react";

/**
 * Holds per-device control sessions above the router so lock, live state and
 * the last capture survive navigation (e.g. to the archive and back).
 *
 * Placeholder — implemented together with the control page rewrite.
 */
export function DeviceSessionProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
