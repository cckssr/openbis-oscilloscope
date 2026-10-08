/**
 * The single seam between the settings registry/inspector and the device
 * session store. Renderers import hooks from here only, so tests and the
 * visual playground can replace the store in one place.
 */
import { useMemo } from "react";
import type { Capability } from "../../api/types";
import { useDeviceSessionSelector, useSetting } from "../state/deviceSession";
import type { SettingsSnapshot } from "../state/deviceSession/types";
import { overlayPending } from "./overlay";

export { useSetting };

/** What the inspector needs from the store. */
export interface InspectorModel {
  capabilities: Capability[];
  channelCount: number;
  /** Applied settings with pending edits overlaid; null until the first load. */
  settings: SettingsSnapshot | null;
  loading: boolean;
}

/**
 * Subscribes to capabilities, channel count and the settings snapshot of a device.
 * @param deviceId - The device
 * @returns The model; re-renders only when one of these slices changes
 */
export function useInspectorModel(deviceId: string): InspectorModel {
  const capabilities = useDeviceSessionSelector(
    deviceId,
    (s) => s.capabilities,
  );
  const channelCount = useDeviceSessionSelector(
    deviceId,
    (s) => s.channelCount,
  );
  const applied = useDeviceSessionSelector(deviceId, (s) => s.settings.applied);
  const pending = useDeviceSessionSelector(deviceId, (s) => s.settings.pending);
  const loading = useDeviceSessionSelector(deviceId, (s) => s.settings.loading);
  const settings = useMemo(
    () => (applied ? overlayPending(applied, pending) : null),
    [applied, pending],
  );
  return { capabilities, channelCount, settings, loading };
}
