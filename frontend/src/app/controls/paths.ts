/** Mapping from registry definitions to store setting paths and resolved values. */
import type { SettingPath } from "../state/deviceSession/types";
import type {
  ControlContext,
  ControlDef,
  ControlGroupDef,
  Resolvable,
} from "./types";

/**
 * Setting path of one control.
 * @param group - The group the control belongs to
 * @param def - The control
 * @param channel - Channel number for `perChannel` groups
 * @returns `channels.<n>.<key>`, or `<prefix>.<key>` (prefix defaults to the group id)
 */
export function controlPath(
  group: ControlGroupDef,
  def: ControlDef,
  channel?: number,
): SettingPath {
  if (group.perChannel)
    return `channels.${channel ?? 1}.${def.key}` as SettingPath;
  return `${group.pathPrefix ?? group.id}.${def.key}` as SettingPath;
}

/**
 * Evaluates a value that may depend on the context.
 * @param value - Static value or function of the context
 * @param ctx - The control context
 * @returns The resolved value
 */
export function resolve<T>(value: Resolvable<T>, ctx: ControlContext): T {
  return typeof value === "function"
    ? (value as (c: ControlContext) => T)(ctx)
    : value;
}
