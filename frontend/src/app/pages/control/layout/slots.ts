import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ActionLayout } from "../actions";

/** What the inspector slot is asked to render for the current breakpoint. */
export interface InspectorSlotOptions {
  /** `tabs` in the side panel / landscape sheet, `accordion` in the portrait sheet. */
  layout: "tabs" | "accordion";
  /** Settings group to show first (the rail icon that was tapped). */
  initialGroupId?: string;
}

/** One settings group, as shown in the landscape icon rail. */
export interface InspectorGroupInfo {
  id: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Named slots of the control page (review §6.6). Features fill slots; the
 * `ControlLayout` decides where each one goes per breakpoint. Slots whose
 * content depends on the breakpoint are render functions.
 */
export interface ControlSlots {
  header: ReactNode;
  banners: ReactNode;
  stepper: ReactNode;
  /** Plot including its toolbar extras. */
  plot: ReactNode;
  /** Measurement table under the plot. */
  readouts: ReactNode;
  statusbar: ReactNode;
  /**
   * Live / capture buttons in the given arrangement. `extras` (layout-owned
   * buttons such as Notiz and Einstellungen) are placed right after the
   * capture button.
   */
  actions: (layout: ActionLayout, extras?: ReactNode) => ReactNode;
  /** Settings inspector. */
  inspector: (options: InspectorSlotOptions) => ReactNode;
  /** "Letzte Aufnahme" card (note, upload selection), opened from a sheet on tablets. */
  lastCapture: (layout: "card" | "compact") => ReactNode;
}
