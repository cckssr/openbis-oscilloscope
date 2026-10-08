/**
 * Pure rules: which actions exist for a device and why one is disabled.
 * Shared by the buttons and the keyboard shortcuts so both always agree.
 */
import type { Capability } from "../../../../api/types";
import { de } from "../../../../i18n/de";
import type { ActionModel } from "./session";

const r = de.control.actions.reasons;

/** Visibility and disabled reason of one action. */
export interface Availability {
  /** false: the device lacks the capability, the control is not rendered. */
  visible: boolean;
  /** German reason when the control is disabled, null when it can be used. */
  reason: string | null;
}

export type ActionId =
  | "liveToggle"
  | "stopScope"
  | "autoscale"
  | "single"
  | "forceTrigger"
  | "series"
  | "capture"
  | "fullResolution"
  | "screenshot";

/**
 * Whether the device offers a capability. An empty list means the driver is
 * not connected; controls then stay visible (and are disabled with a reason).
 * @param model - Action model
 * @param capability - The capability
 * @returns true when present or unknown
 */
export function hasCapability(
  model: ActionModel,
  capability: Capability,
): boolean {
  return (
    model.capabilities.length === 0 || model.capabilities.includes(capability)
  );
}

/**
 * Reason why no command can be sent right now, or null.
 * @param model - Action model
 * @returns German reason or null
 */
export function commonReason(model: ActionModel): string | null {
  switch (model.lockStatus) {
    case "held":
      break;
    case "acquiring":
      return r.acquiring;
    case "releasing":
      return r.releasing;
    case "passive":
      return r.passive;
    case "lost":
      return r.lost;
    default:
      return r.needControl;
  }
  if (model.capabilities.length === 0) return r.notConnected;
  if (model.fullResolution) return r.fullResolution;
  return model.busy;
}

const allowed = (visible: boolean, reason: string | null): Availability => ({
  visible,
  reason,
});

/**
 * Computes visibility and disabled reason of every action.
 * @param model - Action model
 * @returns One entry per {@link ActionId}
 */
export function availability(
  model: ActionModel,
): Record<ActionId, Availability> {
  const common = commonReason(model);
  const noSeries = model.seriesOn ? r.seriesRunning : null;
  const liveRunning =
    model.liveStatus === "on" || model.liveStatus === "paused";
  return {
    // Stopping live is a local action and stays possible whenever live runs (A7).
    liveToggle: allowed(
      hasCapability(model, "run") && hasCapability(model, "preview"),
      liveRunning
        ? null
        : model.liveStatus === "starting"
          ? r.liveStarting
          : common,
    ),
    stopScope: allowed(hasCapability(model, "stop"), common),
    autoscale: allowed(hasCapability(model, "autoscale"), common ?? noSeries),
    single: allowed(hasCapability(model, "single"), common),
    forceTrigger: allowed(hasCapability(model, "force_trigger"), common),
    series: allowed(
      hasCapability(model, "acquire"),
      model.seriesOn && model.lockStatus === "held" ? null : common,
    ),
    capture: allowed(hasCapability(model, "acquire"), common ?? noSeries),
    fullResolution: allowed(
      hasCapability(model, "acquire"),
      common ?? noSeries,
    ),
    screenshot: allowed(hasCapability(model, "screenshot"), common),
  };
}
