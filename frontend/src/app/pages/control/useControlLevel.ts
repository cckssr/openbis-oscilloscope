import { useCallback, useState } from "react";
import type { ControlLevel } from "../../controls";

/** localStorage key of the chosen bedienung level. */
export const CONTROL_LEVEL_KEY = "controlLevel";
/** Key of the former Eingeschränkt/Experte toggle, migrated once. */
const LEGACY_KEY = "expertMode";

/**
 * Reads the stored level.
 * @returns `basic` (Einfach, default) or `expert` (Erweitert)
 */
export function readControlLevel(): ControlLevel {
  try {
    const stored = localStorage.getItem(CONTROL_LEVEL_KEY);
    if (stored === "basic" || stored === "expert") return stored;
    if (localStorage.getItem(LEGACY_KEY) === "true") return "expert";
  } catch {
    /* storage unavailable: fall through */
  }
  return "basic";
}

/**
 * Einfach / Erweitert choice of the control page, persisted in localStorage
 * (`controlLevel`). Starts as `basic` for first-time users.
 *
 * @returns `[level, setLevel]`
 */
export function useControlLevel(): [ControlLevel, (level: ControlLevel) => void] {
  const [level, setLevelState] = useState<ControlLevel>(readControlLevel);
  const setLevel = useCallback((next: ControlLevel) => {
    setLevelState(next);
    try {
      localStorage.setItem(CONTROL_LEVEL_KEY, next);
    } catch {
      /* the choice just does not persist */
    }
  }, []);
  return [level, setLevel];
}
