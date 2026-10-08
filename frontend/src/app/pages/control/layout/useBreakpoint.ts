import { useMediaQuery } from "../../../components/plot/useMediaQuery";

/**
 * Layout class of the control page (review §3.2).
 * - `desktop`: >= 1280 px, three regions.
 * - `landscape`: 1024-1279 px, icon rail + settings sheet.
 * - `portrait`: < 1024 px (tablet portrait, 768 px and up), plot on top + bottom bar.
 */
export type Breakpoint = "desktop" | "landscape" | "portrait";

/** Minimum viewport widths (px). */
export const DESKTOP_MIN_WIDTH = 1280;
export const LANDSCAPE_MIN_WIDTH = 1024;

/**
 * Maps a viewport width to a {@link Breakpoint}.
 * @param width - Viewport width in CSS px
 * @returns The layout class
 */
export function breakpointForWidth(width: number): Breakpoint {
  if (width >= DESKTOP_MIN_WIDTH) return "desktop";
  if (width >= LANDSCAPE_MIN_WIDTH) return "landscape";
  return "portrait";
}

/**
 * Current layout class, following the viewport via `matchMedia`.
 * @returns `desktop`, `landscape` or `portrait`
 */
export function useBreakpoint(): Breakpoint {
  const desktop = useMediaQuery(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
  const landscape = useMediaQuery(`(min-width: ${LANDSCAPE_MIN_WIDTH}px)`);
  if (desktop) return "desktop";
  return landscape ? "landscape" : "portrait";
}
