import { useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query.
 * @param query - e.g. "(pointer: coarse)"
 * @returns Whether the query currently matches (false where matchMedia is missing)
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => (typeof window !== "undefined" && !!window.matchMedia?.(query).matches),
    () => false,
  );
}
