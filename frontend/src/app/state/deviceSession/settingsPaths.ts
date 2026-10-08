/** Pure helpers around setting paths and the applied-settings snapshot. */
import type {
  ChannelConfig,
  TimebaseConfig,
  TriggerConfig,
  AcquiredChannel,
} from "../../../api/types";
import type {
  SettingPath,
  SettingValue,
  SettingsSnapshot,
  SettingsState,
} from "./types";

/** Group of settings that are written to the scope together. */
export type SettingGroup = `channels.${number}` | "timebase" | "trigger";

/**
 * Splits a path into group and key.
 * @param path - e.g. `channels.2.scale_v_div`
 * @returns `{ group: "channels.2", key: "scale_v_div" }`
 */
export function parsePath(path: SettingPath): {
  group: SettingGroup;
  key: string;
} {
  const parts = path.split(".");
  if (parts[0] === "channels") {
    return { group: `channels.${Number(parts[1])}`, key: parts[2] };
  }
  return { group: parts[0] as "timebase" | "trigger", key: parts[1] };
}

/**
 * Group a path belongs to.
 * @param path - A setting path
 * @returns The debounce / write group
 */
export function groupOf(path: SettingPath): SettingGroup {
  return parsePath(path).group;
}

/**
 * Reads one value out of a snapshot.
 * @param snapshot - Applied settings
 * @param path - Setting path
 * @returns The value, or undefined if the snapshot does not contain it
 */
export function readValue(
  snapshot: SettingsSnapshot,
  path: SettingPath,
): SettingValue | undefined {
  const { group, key } = parsePath(path);
  const obj = groupObject(snapshot, group) as
    Record<string, SettingValue> | undefined;
  return obj?.[key];
}

function groupObject(
  snapshot: SettingsSnapshot,
  group: SettingGroup,
): ChannelConfig | TimebaseConfig | TriggerConfig | undefined {
  if (group === "timebase") return snapshot.timebase;
  if (group === "trigger") return snapshot.trigger;
  return snapshot.channels[Number(group.split(".")[1])];
}

/**
 * Returns the snapshot with one group replaced by `config`.
 * @param snapshot - Applied settings
 * @param group - The group to replace
 * @param config - New group config
 * @returns A new snapshot (the input is not mutated)
 */
export function withGroup(
  snapshot: SettingsSnapshot,
  group: SettingGroup,
  config: ChannelConfig | TimebaseConfig | TriggerConfig,
): SettingsSnapshot {
  if (group === "timebase")
    return { ...snapshot, timebase: config as TimebaseConfig };
  if (group === "trigger")
    return { ...snapshot, trigger: config as TriggerConfig };
  const n = Number(group.split(".")[1]);
  return {
    ...snapshot,
    channels: { ...snapshot.channels, [n]: config as ChannelConfig },
  };
}

/**
 * Applied group config with pending values written over it.
 * @param snapshot - Applied settings
 * @param group - The group
 * @param values - Pending values of this group, keyed by path
 * @returns The full group config to send to the scope
 */
export function mergeGroup(
  snapshot: SettingsSnapshot,
  group: SettingGroup,
  values: Array<[SettingPath, SettingValue]>,
): ChannelConfig | TimebaseConfig | TriggerConfig {
  const base = { ...groupObject(snapshot, group) } as Record<
    string,
    SettingValue
  >;
  for (const [path, value] of values) base[parsePath(path).key] = value;
  return base as unknown as ChannelConfig | TimebaseConfig | TriggerConfig;
}

/**
 * Whether a setting is currently being edited or written (live frames must not touch it).
 * @param settings - Settings state
 * @param path - Setting path
 * @returns True when pending or applying
 */
export function isBusyPath(
  settings: SettingsState,
  path: SettingPath,
): boolean {
  return (
    path in settings.pending || settings.status[path]?.state === "applying"
  );
}

/**
 * Copies what a frame reports (channels, timebase, trigger) into the applied
 * settings, except for paths the user is editing or that are being written.
 * @param settings - Current settings state
 * @param channels - Channel configs of the frame
 * @param timebase - Timebase of the frame
 * @param trigger - Trigger of the frame
 * @returns The new applied snapshot, or the same object if nothing changed
 */
export function mergeFrameIntoApplied(
  settings: SettingsState,
  channels: AcquiredChannel[],
  timebase: TimebaseConfig,
  trigger: TriggerConfig,
): SettingsSnapshot | null {
  const applied = settings.applied;
  if (!applied) return null;
  let next = applied;

  const apply = (
    group: SettingGroup,
    reported: object,
    pathOf: (key: string) => SettingPath,
  ) => {
    const current = groupObject(next, group) as
      Record<string, SettingValue> | undefined;
    if (!current) return;
    const merged: Record<string, SettingValue> = { ...current };
    let changed = false;
    for (const [key, value] of Object.entries(reported)) {
      if (!(key in current)) continue;
      if (key !== "sample_rate" && isBusyPath(settings, pathOf(key))) continue;
      if (merged[key] !== value) {
        merged[key] = value as SettingValue;
        changed = true;
      }
    }
    if (changed) {
      next = withGroup(next, group, merged as unknown as ChannelConfig);
    }
  };

  for (const ch of channels) {
    if (!applied.channels[ch.channel]) continue;
    apply(
      `channels.${ch.channel}`,
      ch,
      (key) => `channels.${ch.channel}.${key}` as SettingPath,
    );
  }
  apply("timebase", timebase, (key) => `timebase.${key}` as SettingPath);
  apply("trigger", trigger, (key) => `trigger.${key}` as SettingPath);
  return next;
}
