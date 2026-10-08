import { useEffect, useState } from "react";

/**
 * Tracks the content size of an element with a ResizeObserver.
 * @param element - The element to observe (null until mounted)
 * @returns `{ width, height }` in CSS px; zeros until measured
 */
export function useElementSize(element: HTMLElement | null): {
  width: number;
  height: number;
} {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return;
    const apply = (w: number, h: number) =>
      setSize((s) =>
        Math.abs(s.width - w) < 1 && Math.abs(s.height - h) < 1
          ? s
          : { width: w, height: h },
      );
    const observer = new ResizeObserver(([entry]) => {
      apply(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}
