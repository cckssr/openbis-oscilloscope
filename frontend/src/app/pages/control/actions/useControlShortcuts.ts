import { useEffect, useRef } from "react";
import { availability } from "./availability";
import { useActionModel, useDeviceActions } from "./session";

/** Id of the note field the "N" shortcut focuses (`LastCaptureCard`). */
export const NOTE_INPUT_ID = "capture-note-input";

export interface ControlShortcutOptions {
  /** Called by "F"; without it that key does nothing. */
  onOpenFullResolution?: () => void;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
/** Elements that handle Space themselves (native click or ARIA widget). */
const SPACE_HANDLERS = "button, a[href], summary, [role='button'], [role='switch'], [role='checkbox'], [role='tab'], [role='menuitem'], [role='option'], [role='radio']";
const OPEN_OVERLAY = "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return TYPING_TAGS.has(target.tagName) || target.isContentEditable;
}

/**
 * Keyboard shortcuts of the control page: Space = Live on/off, S = save
 * capture, N = focus the note field, F = full resolution (when a handler is
 * given). Ignored while typing, while a dialog or menu is open, with
 * modifier keys, and unless this tab controls the device. Respects the same
 * disabled reasons as the buttons.
 *
 * @param deviceId - The device
 * @param options - Optional handlers, see {@link ControlShortcutOptions}
 */
export function useControlShortcuts(deviceId: string, options: ControlShortcutOptions = {}): void {
  const model = useActionModel(deviceId);
  const actions = useDeviceActions(deviceId);
  const latest = useRef({ model, actions, options });
  useEffect(() => {
    latest.current = { model, actions, options };
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const { model, actions, options } = latest.current;
      if (model.lockStatus !== "held") return;
      if (isTyping(e.target) || document.querySelector(OPEN_OVERLAY)) return;
      const av = availability(model);
      const key = e.key.toLowerCase();

      if (e.key === " " || e.code === "Space") {
        if (e.repeat || (e.target instanceof Element && e.target.closest(SPACE_HANDLERS))) return;
        if (!av.liveToggle.visible || av.liveToggle.reason) return;
        e.preventDefault();
        if (model.liveStatus === "on" || model.liveStatus === "paused") actions.stopLive();
        else void actions.startLive();
      } else if (key === "s") {
        if (e.repeat || !av.capture.visible || av.capture.reason) return;
        e.preventDefault();
        void actions.saveCapture();
      } else if (key === "n") {
        const field = document.getElementById(NOTE_INPUT_ID);
        if (!field) return;
        e.preventDefault();
        field.focus();
      } else if (key === "f") {
        if (e.repeat || !options.onOpenFullResolution) return;
        if (!av.fullResolution.visible || av.fullResolution.reason) return;
        e.preventDefault();
        options.onOpenFullResolution();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
