/** Builders that turn API responses into plot frames. */
import type {
  AcquiredChannel,
  PreviewResponse,
  AcquireResponse,
  TimebaseConfig,
  TriggerConfig,
  WaveformData,
} from "../../../api/types";
import { tracesFromWaveforms, type Timebase } from "../../../lib/trace";
import type { Frame, SettingsSnapshot } from "./types";

/**
 * Channels enabled in the applied settings (live and captures request only these).
 * @param applied - Applied settings, or null when not loaded
 * @returns Sorted channel numbers, or undefined when settings are unknown
 */
export function enabledChannels(applied: SettingsSnapshot | null): number[] | undefined {
  if (!applied) return undefined;
  return Object.entries(applied.channels)
    .filter(([, cfg]) => cfg.enabled)
    .map(([n]) => Number(n))
    .sort((a, b) => a - b);
}

/**
 * Converts the API timebase to the plot's model.
 * @param tb - Timebase as reported by the backend
 * @returns The plot timebase
 */
export function timebaseOf(tb: TimebaseConfig): Timebase {
  return { scaleSDiv: tb.scale_s_div, offsetS: tb.offset_s, sampleRate: tb.sample_rate };
}

function buildFrame(
  source: Frame["source"],
  waveforms: WaveformData[],
  channels: AcquiredChannel[],
  timebase: TimebaseConfig,
  trigger: TriggerConfig,
  receivedAt: number,
): Frame {
  const traces = tracesFromWaveforms(waveforms, channels);
  return {
    source,
    traces,
    channels,
    timebase: timebaseOf(timebase),
    trigger,
    memoryDepth: traces.reduce((max, t) => Math.max(max, t.x.length), 0),
    receivedAt,
  };
}

/**
 * Builds a live frame from a preview response.
 * @param resp - Preview response
 * @param receivedAt - Arrival time (ms since epoch)
 * @returns A frame with source "live"
 */
export function frameFromPreview(resp: PreviewResponse, receivedAt: number): Frame {
  return buildFrame("live", resp.waveforms, resp.channels, resp.timebase, resp.trigger, receivedAt);
}

/**
 * Builds a capture frame from an acquire response requested with `includeData`.
 * @param resp - Acquire response
 * @param receivedAt - Arrival time (ms since epoch)
 * @returns A frame with source "capture"
 */
export function frameFromAcquire(resp: AcquireResponse, receivedAt: number): Frame {
  return buildFrame(
    "capture",
    resp.waveforms ?? [],
    resp.channels,
    resp.timebase,
    resp.trigger,
    receivedAt,
  );
}

/**
 * Builds a capture frame from stored waveforms (restore after a reload). The
 * archive keeps no per-capture settings, so channel configs, timebase and
 * trigger come from the caller (the scope's current settings) and the sample
 * rate is derived from the time axis.
 * @param waveforms - Waveforms loaded from the archive
 * @param applied - Current applied settings, or null when unknown
 * @param receivedAt - Time of the restore (ms since epoch)
 * @returns A frame with source "capture"
 */
export function frameFromArchive(
  waveforms: WaveformData[],
  applied: SettingsSnapshot | null,
  receivedAt: number,
): Frame {
  const channels: AcquiredChannel[] = waveforms.map((w) => ({
    channel: w.channel,
    enabled: true,
    scale_v_div: applied?.channels[w.channel]?.scale_v_div ?? 1,
    offset_v: applied?.channels[w.channel]?.offset_v ?? 0,
    coupling: applied?.channels[w.channel]?.coupling ?? "DC",
    probe_attenuation: applied?.channels[w.channel]?.probe_attenuation ?? 1,
  }));
  const first = waveforms.find((w) => w.time_s.length > 1);
  const span = first ? first.time_s[first.time_s.length - 1] - first.time_s[0] : 0;
  const dt = first ? first.time_s[1] - first.time_s[0] : 0;
  const timebase: TimebaseConfig = {
    scale_s_div: applied?.timebase.scale_s_div ?? span / 10,
    offset_s: applied?.timebase.offset_s ?? 0,
    sample_rate: dt > 0 ? 1 / dt : (applied?.timebase.sample_rate ?? 0),
  };
  const trigger: TriggerConfig = applied?.trigger ?? {
    source: "CH1",
    level_v: 0,
    slope: "RISE",
    mode: "AUTO",
  };
  return buildFrame("capture", waveforms, channels, timebase, trigger, receivedAt);
}
