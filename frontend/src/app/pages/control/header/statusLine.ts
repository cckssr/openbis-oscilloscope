import { de } from "../../../../i18n/de";
import type { HeaderModel } from "./model";

const t = de.control.page.header;

/**
 * Time of day for "aktiv seit".
 * @param ms - Epoch milliseconds
 * @returns "14:02"
 */
export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One-line state of the device for the header, e.g.
 * "Du steuerst dieses Gerät · aktiv seit 14:02".
 *
 * @param m - Header slice
 * @returns German status sentence
 */
export function statusLine(m: HeaderModel): string {
  switch (m.lockStatus) {
    case "held":
    case "releasing":
      return m.since ? t.held(clockTime(m.since)) : t.heldNoTime;
    case "passive":
      return t.passive;
    case "lost":
      return t.lost;
    default:
  }
  const d = m.device;
  if (!d) return "";
  if (d.state === "OFFLINE") return t.offline;
  if (d.state === "ERROR") return t.error;
  if (d.lock && !d.lock.is_mine) return t.lockedBy(d.lock.owner_user);
  return t.free;
}
