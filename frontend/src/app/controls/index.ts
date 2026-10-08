/**
 * Settings registry: importing this module registers the built-in groups
 * (channels, timebase, trigger). Add a scope feature by calling
 * {@link registerControlGroup} with a new {@link ControlGroupDef}.
 */
import { registerControlGroup } from "./registry";
import { channelsGroup } from "./groups/channels";
import { timebaseGroup } from "./groups/timebase";
import { triggerGroup } from "./groups/trigger";

registerControlGroup(channelsGroup);
registerControlGroup(timebaseGroup);
registerControlGroup(triggerGroup);

export {
  registerControlGroup,
  getControlGroups,
  isVisibleAtLevel,
} from "./registry";
export { channelSummary } from "./groups/channels";
export { controlPath } from "./paths";
export type {
  ControlContext,
  ControlDef,
  ControlGroupDef,
  ControlLevel,
  EnumControlDef,
  EnumOption,
  GroupComponentProps,
  GroupFilter,
  NumberControlDef,
  Resolvable,
  ToggleControlDef,
} from "./types";
