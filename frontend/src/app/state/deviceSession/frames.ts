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
