import { useCallback, useState } from "react";

/**
 * A string list persisted in localStorage (per-viewer convenience such as the
 * chosen measurements). Works without storage (private mode, tests).
 * @param key - localStorage key
 * @param initial - Value used when nothing valid is stored
 * @returns The list and a setter that also persists
 */
export function usePersistentList(
  key: string,
  initial: string[],
): [string[], (next: string[]) => void] {
  const [value, setValue] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string"))
        return parsed;
    } catch {
      /* storage unavailable or corrupt: use defaults */
    }
    return initial;
  });
  const update = useCallback(
    (next: string[]) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, update];
}
