/**
 * Registry contract for the settings inspector (review §6.2). New scope
 * features (acquisition mode, averaging, memory depth …) are added as
 * {@link ControlGroupDef} data; the generic renderers in `renderers/` and the
 * inspector in `pages/control/settings/` handle validation, units, stepping,
 * touch sizes and per-control apply status once.
 */
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { Capability } from "../../api/types";
import type { SettingsSnapshot } from "../state/deviceSession/types";

/** Which controls are shown: `basic` = "Einfach", `expert` = "Erweitert" (shows everything). */
export type ControlLevel = "basic" | "expert";

/**
 * What a control definition may depend on. `settings` already contains pending
 * (not yet confirmed) edits, so steps follow what the user just chose.
 */
export interface ControlContext {
  settings: SettingsSnapshot;
  /** 1-based channel number inside a `perChannel` group. */
  channel?: number;
  /** Number of analog channels of the scope. */
  channelCount: number;
}

/** A static value or one derived from the {@link ControlContext}. */
export type Resolvable<T> = T | ((ctx: ControlContext) => T);

/** Fields shared by all control kinds. */
interface ControlBase {
  /** Key inside the settings group (`scale_v_div`); the path is built from group and key. */
  key: string;
  label: string;
  /** German explanation shown in the "?" popover (works on tap). */
  help?: string;
  /** Level at which the control appears; expert shows basic controls as well. */
  level: ControlLevel;
  /** Hides the control while this returns false (e.g. channel settings of a disabled channel). */
  visible?: (ctx: ControlContext) => boolean;
  /** Capability the scope must report for this control to appear. */
  requires?: Capability;
}

/** Numeric setting with optional 1-2-5 stepping. */
export interface NumberControlDef extends ControlBase {
  kind: "number";
  /** Unit used for parsing and display, e.g. `"V"` or `"V/div"`. */
  unit: string;
  min?: Resolvable<number>;
  max?: Resolvable<number>;
  /**
   * `linear`: ± adds `step`. `"125"`: 1-2-5 sequence between `min` and `max`.
   * Array: explicit ascending list of allowed steps.
   */
  scale: "linear" | "125" | number[];
  /** Linear step (default 0.1); ignored for sequences. */
  step?: Resolvable<number>;
  /** Display formatter; default `formatSI(value, unit)` (`200 mV/div`). */
  format?: (value: number) => string;
}

/** One choice of an {@link EnumControlDef}; numbers (probe factor) stay numbers in the setting. */
export interface EnumOption {
  value: string | number;
  label: string;
  /** Short explanation shown as visible text when the option is selected. */
  help?: string;
}

/** Single-choice setting. */
export interface EnumControlDef extends ControlBase {
  kind: "enum";
  options: Resolvable<EnumOption[]>;
}

/** On/off setting. */
export interface ToggleControlDef extends ControlBase {
  kind: "toggle";
}

export type ControlDef = NumberControlDef | EnumControlDef | ToggleControlDef;

/** Props of a custom group component (see {@link ControlGroupDef.component}). */
export interface GroupComponentProps {
  deviceId: string;
  group: ControlGroupDef;
  ctx: ControlContext;
  disabled: boolean;
}

/** One group of settings = one tab / accordion item of the inspector. */
export interface ControlGroupDef {
  /** Stable id (`channels`, `timebase`, `trigger`, `acquire` …). */
  id: string;
  label: string;
  icon: LucideIcon;
  /** Capability the scope must report, else the group is hidden. */
  requires?: Capability;
  /** Lowest level at which the group appears. */
  level: ControlLevel;
  /** Rendered once per channel (`channels.<n>.<key>` paths). */
  perChannel?: boolean;
  /** For `perChannel` groups: key of the on/off toggle that lives in the section header. */
  enableKey?: string;
  /** Path prefix of non-channel groups; defaults to `id`. */
  pathPrefix?: string;
  controls: ControlDef[];
  /** One-line summary for collapsed sections, e.g. `CH1 · 200 mV/div · DC · 1×`. */
  summary?: (ctx: ControlContext) => string;
  /** Replaces the generic control list for special cases. */
  component?: ComponentType<GroupComponentProps>;
}

/** Filter for {@link getControlGroups}. */
export interface GroupFilter {
  level: ControlLevel;
  /** Capabilities the scope reports. */
  capabilities: readonly string[];
  channelCount: number;
}
