/** Pure helper: applied settings with local (not yet confirmed) edits written over them. */
import type {
  SettingPath,
  SettingValue,
  SettingsSnapshot,
} from "../state/deviceSession/types";
import {
  groupOf,
  mergeGroup,
  withGroup,
} from "../state/deviceSession/settingsPaths";

/**
 * Overlays pending edits onto the applied snapshot so control definitions
 * (steps, summaries) follow what the user just chose, e.g. the offset step
 * after V/div changed.
 * @param applied - Settings as the scope reports them
 * @param pending - Local values by path
 * @returns A new snapshot, or `applied` itself when nothing is pending
 */
export function overlayPending(
  applied: SettingsSnapshot,
  pending: Partial<Record<SettingPath, SettingValue>>,
): SettingsSnapshot {
  const byGroup = new Map<
    ReturnType<typeof groupOf>,
    Array<[SettingPath, SettingValue]>
  >();
  for (const [path, value] of Object.entries(pending) as Array<
    [SettingPath, SettingValue]
  >) {
    if (value === undefined) continue;
    const group = groupOf(path);
    byGroup.set(group, [...(byGroup.get(group) ?? []), [path, value]]);
  }
  let result = applied;
  for (const [group, values] of byGroup) {
    result = withGroup(result, group, mergeGroup(result, group, values));
  }
  return result;
}
