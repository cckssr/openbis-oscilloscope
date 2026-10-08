import { useMemo } from "react";
import { getControlGroups, type ControlLevel } from "../../controls";
import { useInspectorModel } from "../../controls/store";
import type { InspectorGroupInfo } from "./layout";

/**
 * Settings groups visible at `level` (id, label, icon), for the landscape rail.
 * @param deviceId - The device
 * @param level - Einfach (`basic`) or Erweitert (`expert`)
 * @returns Group descriptors in tab order
 */
export function useInspectorGroups(
  deviceId: string,
  level: ControlLevel,
): InspectorGroupInfo[] {
  const { capabilities, channelCount } = useInspectorModel(deviceId);
  return useMemo(
    () =>
      getControlGroups({ level, capabilities, channelCount }).map((g) => ({
        id: g.id,
        label: g.label,
        icon: g.icon,
      })),
    [level, capabilities, channelCount],
  );
}
