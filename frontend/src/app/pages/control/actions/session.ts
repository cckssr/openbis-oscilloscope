/**
 * The single seam between the control-page action/capture/status components
 * and the device session store. Components import hooks from here only, so
 * tests can replace the store in one place (`vi.mock("./session")`).
 */
import type { Capability } from "../../../../api/types";
import { useDeviceSessionSelector } from "../../../state/deviceSession";
import { useDeviceSessionStore } from "../../../state/deviceSession/hooks";
import type {
  DeviceSessionActions,
  DeviceSessionState,
  LiveStatus,
  LockStatus,
} from "../../../state/deviceSession/types";

export { useDeviceSessionSelector };

/**
 * Actions of a device's store. The actions object is stable, so calling this
 * never causes a re-render (unlike `useDeviceSession`).
 * @param deviceId - The device
 * @returns The store actions
 */
export function useDeviceActions(deviceId: string): DeviceSessionActions {
  const store = useDeviceSessionStore(deviceId);
  return store!.actions;
}

/** Everything the action buttons need to decide "visible / enabled / why not". */
export interface ActionModel {
  lockStatus: LockStatus;
  /** Label of the running serialized command, or null. */
  busy: string | null;
  capabilities: Capability[];
  liveStatus: LiveStatus;
  seriesOn: boolean;
  seriesCount: number;
  /** A "capture" job is running. */
  capturing: boolean;
  /** A "full-resolution" job is running. */
  fullResolution: boolean;
  /** A "screenshot" job is running. */
  screenshotting: boolean;
}

/**
 * Derives the {@link ActionModel} from the store state. Only primitives and
 * the (stable) capabilities array are returned, so job progress updates do
 * not change the result.
 * @param s - Store state
 * @returns The model
 */
export function selectActionModel(s: DeviceSessionState): ActionModel {
  const running = (kind: string) => s.jobs.some((j) => j.kind === kind && j.status === "running");
  return {
    lockStatus: s.lock.status,
    busy: s.busy,
    capabilities: s.capabilities,
    liveStatus: s.live.status,
    seriesOn: s.series.status === "on",
    seriesCount: s.series.count,
    capturing: running("capture"),
    fullResolution: running("full-resolution"),
    screenshotting: running("screenshot"),
  };
}

/**
 * Shallow equality of two {@link ActionModel}s.
 * @param a - Previous model
 * @param b - Next model
 * @returns true when all fields are equal
 */
export function sameActionModel(a: ActionModel, b: ActionModel): boolean {
  return (Object.keys(a) as Array<keyof ActionModel>).every((k) => Object.is(a[k], b[k]));
}

/**
 * Subscribes to the {@link ActionModel} of a device.
 * @param deviceId - The device
 * @returns The model; re-renders only when one of its fields changes
 */
export function useActionModel(deviceId: string): ActionModel {
  return useDeviceSessionSelector(deviceId, selectActionModel, sameActionModel);
}
