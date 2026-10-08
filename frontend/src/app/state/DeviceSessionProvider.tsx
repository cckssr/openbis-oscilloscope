import { useEffect, useMemo, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { DeviceSessionContext } from "./deviceSession/hooks";
import { DeviceSessionRegistry } from "./deviceSession/registry";

/** Pending deferred disposals, cancelled when the effect re-runs (StrictMode). */
const pendingDispose = new WeakMap<DeviceSessionRegistry, () => void>();

/**
 * Holds one device session store per device above the router, so lock, live
 * state and the last capture survive navigation (e.g. to the archive and back).
 * Stores are created lazily on first use. On logout or token change all stores
 * are disposed (timers, loops, subscriptions stop); locks are NOT released.
 *
 * @param props.children - The app below the provider
 */
export function DeviceSessionProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const registry = useMemo(
    () => (token ? new DeviceSessionRegistry(token) : null),
    [token],
  );

  useEffect(() => {
    if (!registry) return;
    // StrictMode runs cleanup and setup back to back: dispose on the next
    // tick and let a re-run of the effect cancel it.
    pendingDispose.get(registry)?.();
    return () => {
      const timer = setTimeout(() => registry.disposeAll(), 0);
      pendingDispose.set(registry, () => clearTimeout(timer));
    };
  }, [registry]);

  return (
    <DeviceSessionContext.Provider value={registry}>
      {children}
    </DeviceSessionContext.Provider>
  );
}
