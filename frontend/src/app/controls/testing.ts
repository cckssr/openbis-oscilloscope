/** Test fixtures shared by the settings tests (not imported by production code). */
import type { SettingsSnapshot } from "../state/deviceSession/types";
import type { ControlContext } from "./types";

/**
 * Snapshot with `channelCount` channels: CH1 enabled at 200 mV/div DC 1×,
 * all others disabled.
 * @param channelCount - Number of channels
 * @returns A settings snapshot
 */
export function makeSnapshot(channelCount = 4): SettingsSnapshot {
  const channels: SettingsSnapshot["channels"] = {};
  for (let n = 1; n <= channelCount; n++) {
    channels[n] = {
      enabled: n === 1,
      scale_v_div: 0.2,
      offset_v: 0,
      coupling: "DC",
      probe_attenuation: 1,
    };
  }
  return {
    channels,
    timebase: { scale_s_div: 1e-3, offset_s: 0, sample_rate: 1e6 },
    trigger: { source: "CH1", level_v: 0, slope: "RISE", mode: "AUTO" },
  };
}

/**
 * Control context for tests.
 * @param channelCount - Number of channels
 * @param channel - Channel for per-channel controls
 * @returns The context
 */
export function makeContext(
  channelCount = 4,
  channel?: number,
): ControlContext {
  return { settings: makeSnapshot(channelCount), channelCount, channel };
}
