/** Memoization behind `useDeviceSessionSelector`. */

/**
 * Caches the last selected slice so a selector that returns a fresh object
 * for equal content does not trigger a re-render.
 */
export class SelectorCache<S, T> {
  private hasValue = false;
  private lastState: S | undefined;
  private lastSelected: T | undefined;

  /**
   * Selects from `state`, reusing the previous slice when `isEqual` says it did not change.
   * @param state - Store state
   * @param selector - Picks the slice
   * @param isEqual - Equality of two slices
   * @returns A referentially stable slice
   */
  select(state: S, selector: (s: S) => T, isEqual: (a: T, b: T) => boolean): T {
    if (this.hasValue && this.lastState === state) return this.lastSelected as T;
    const next = selector(state);
    if (this.hasValue && isEqual(this.lastSelected as T, next)) {
      this.lastState = state;
      return this.lastSelected as T;
    }
    this.hasValue = true;
    this.lastState = state;
    this.lastSelected = next;
    return next;
  }
}
