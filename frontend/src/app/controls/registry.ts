/** Module-level registry of control groups; the inspector renders whatever is registered. */
import type {
  ControlDef,
  ControlGroupDef,
  ControlLevel,
  GroupFilter,
} from "./types";

const groups: ControlGroupDef[] = [];

/**
 * Registers a group of controls (or replaces the group with the same id, so
 * hot reloads and repeated imports are harmless). Groups keep registration order.
 * @param def - The group definition
 * @returns A function that removes the group again
 */
export function registerControlGroup(def: ControlGroupDef): () => void {
  const index = groups.findIndex((g) => g.id === def.id);
  if (index >= 0) groups[index] = def;
  else groups.push(def);
  return () => {
    const at = groups.indexOf(def);
    if (at >= 0) groups.splice(at, 1);
  };
}

/**
 * Whether something at `level` is visible when the user chose `chosen`.
 * @param level - Level of the group or control
 * @param chosen - Level selected in the UI
 * @returns True for basic items always, expert items only in expert mode
 */
export function isVisibleAtLevel(
  level: ControlLevel,
  chosen: ControlLevel,
): boolean {
  return level === "basic" || chosen === "expert";
}

const controlAllowed = (c: ControlDef, filter: GroupFilter) =>
  isVisibleAtLevel(c.level, filter.level) &&
  (!c.requires || filter.capabilities.includes(c.requires));

/**
 * Registered groups that apply to this scope and level. Groups whose required
 * capability is missing, whose level is too high, or that end up without any
 * visible control are dropped; the returned groups contain only the controls
 * visible at `level`.
 * @param filter - Chosen level, scope capabilities and channel count
 * @returns Groups in registration order
 */
export function getControlGroups(filter: GroupFilter): ControlGroupDef[] {
  const result: ControlGroupDef[] = [];
  for (const group of groups) {
    if (!isVisibleAtLevel(group.level, filter.level)) continue;
    if (group.requires && !filter.capabilities.includes(group.requires))
      continue;
    if (group.perChannel && filter.channelCount < 1) continue;
    const controls = group.controls.filter((c) => controlAllowed(c, filter));
    if (controls.length === 0 && !group.component) continue;
    result.push({ ...group, controls });
  }
  return result;
}
