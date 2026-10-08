/** Subscribes to a CSS media query. */
import { useEffect, useState } from "react";

/**
 * Tracks whether a media query currently matches.
 * @param query - CSS media query, e.g. "(min-width: 1280px)"
 * @returns true while the query matches (false where matchMedia is unavailable)
 */
export function useMediaQuery(query: string): boolean {
  const get = () =>
    typeof window !== "undefined" && !!window.matchMedia?.(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
