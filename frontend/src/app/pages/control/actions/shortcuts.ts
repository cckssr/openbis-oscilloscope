import { de } from "../../../../i18n/de";

const t = de.control.actions.shortcuts;

/** One keyboard shortcut of the control page. */
export interface Shortcut {
  id: "live" | "capture" | "note" | "fullResolution";
  /** Key as shown to the user. */
  keyLabel: string;
  /** What it does (German). */
  label: string;
}

/** Keyboard shortcuts of the control page (review §4.5); use for tooltips and help. */
export const SHORTCUTS: readonly Shortcut[] = [
  { id: "live", keyLabel: t.space, label: t.live },
  { id: "capture", keyLabel: "S", label: t.capture },
  { id: "note", keyLabel: "N", label: t.note },
  { id: "fullResolution", keyLabel: "F", label: t.fullResolution },
];

/**
 * Appends the shortcut to a tooltip text: "Aufnahme speichern (S)".
 * @param text - Tooltip text
 * @param id - Shortcut id
 * @returns Text with the key in parentheses
 */
export function withShortcut(text: string, id: Shortcut["id"]): string {
  const shortcut = SHORTCUTS.find((s) => s.id === id);
  return shortcut ? t.withKey(text, shortcut.keyLabel) : text;
}
