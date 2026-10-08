import { useSyncExternalStore } from "react";
import type { Range } from "./plotGeometry";

/**
 * Tiny external store for the x range while the user drags/pans. Only the
 * cursor overlay subscribes, so a pan does not re-render the plot (and does
 * not call `Plotly.react` mid-gesture).
 */
export class RangeStore {
  private range: Range | null = null;
  private listeners = new Set<() => void>();

  /** Current live range or null when unset. */
  get = (): Range | null => this.range;

  /** Publishes a new range to subscribers. */
  set(range: Range | null): void {
    if (range === this.range) return;
    this.range = range;
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

/**
 * Reads a {@link RangeStore} reactively.
 * @param store - The store
 * @returns The live range or null
 */
export function useRange(store: RangeStore): Range | null {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
