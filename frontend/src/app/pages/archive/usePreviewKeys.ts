/** Keyboard shortcuts of the preview: ← previous, → next, Esc close (split view only). */
import { useEffect, useRef } from "react";

interface PreviewKeyHandlers {
  onPrev: () => void;
  onNext: () => void;
  /** When given, Escape calls it. Leave undefined inside the Dialog (Radix handles Escape). */
  onEscape?: () => void;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    el.getAttribute("role") === "menuitem"
  );
}

/**
 * Binds ←/→ (and optionally Esc) while the preview is open.
 * Ignored while typing in a field and when modifier keys are held.
 * @param enabled - true while a preview is visible
 * @param handlers - Navigation callbacks
 */
export function usePreviewKeys(
  enabled: boolean,
  handlers: PreviewKeyHandlers,
): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        isTypingTarget(e.target)
      )
        return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        ref.current.onPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        ref.current.onNext();
      } else if (e.key === "Escape" && ref.current.onEscape) {
        ref.current.onEscape();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
