import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useBreakpoint } from "./useBreakpoint";

/** Installs a matchMedia that evaluates `min-width` queries against a mutable width. */
function installMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      get matches() {
        return width >= min;
      },
      media: query,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    } as unknown as MediaQueryList;
  });
  return (next: number) => {
    width = next;
    listeners.forEach((cb) => cb());
  };
}

afterEach(cleanup);

describe("useBreakpoint", () => {
  it("follows the viewport width through matchMedia", () => {
    const resize = installMatchMedia(1440);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("desktop");
    act(() => resize(1100));
    expect(result.current).toBe("landscape");
    act(() => resize(800));
    expect(result.current).toBe("portrait");
  });
});
