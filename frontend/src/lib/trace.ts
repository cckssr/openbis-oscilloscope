/**
 * Channel-count-agnostic waveform model shared by the live plot, the archive
 * preview, analyses and exporters. Replaces the old `{time, ch1..ch4}` rows.
 */
import type { AcquiredChannel, WaveformData } from "../api/types";
import { channelColor, channelLabel } from "./channels";

export type TraceKind = "channel" | "math" | "reference" | "analysis";

export interface Trace {
  /** Stable id, e.g. "CH1", "MATH1", "REF-A", "FFT(CH1)". */
  id: string;
  kind: TraceKind;
  /** Source channel for kind "channel", else undefined. */
  channel?: number;
  label: string;
  color: string;
  /** Full-resolution samples; plots decimate, analyses use them as is. */
  x: Float64Array;
  y: Float64Array;
  xUnit: "s" | "Hz";
  yUnit: "V" | "dBV" | "A";
  /** Vertical scale as set on the scope; enables per-channel division display. */
  scale?: { perDiv: number; offset: number };
  coupling?: AcquiredChannel["coupling"];
  probe?: number;
}

/** Non-trace markers drawn on top of the plot. */
export type Overlay =
  | {
      kind: "trigger-level";
      /** Trace the level belongs to (draws in its colour and scale). */
      traceId: string;
      value: number;
    }
  | { kind: "trigger-time"; value: number }
  | { kind: "cursor-x"; id: string; value: number; color?: string }
  | {
      kind: "cursor-y";
      id: string;
      traceId: string;
      value: number;
      color?: string;
    }
  | {
      kind: "marker";
      id: string;
      x: number;
      y: number;
      label: string;
      traceId?: string;
    };

/** Horizontal (time) frame of the scope screen. */
export interface Timebase {
  /** Seconds per division as set on the scope. */
  scaleSDiv: number;
  /** Horizontal trigger offset in seconds. */
  offsetS: number;
  /** Sample rate in Sa/s, 0 when unknown. */
  sampleRate: number;
}

/**
 * Converts API waveforms plus their channel configs into traces.
 * Channels without samples are skipped.
 * @param waveforms - Per-channel samples from preview/acquire/archive
 * @param channels - Applied per-channel settings (scale, offset, coupling, probe)
 * @returns One trace per channel, sorted by channel number
 */
export function tracesFromWaveforms(
  waveforms: WaveformData[],
  channels: AcquiredChannel[] = [],
): Trace[] {
  const cfgByChannel = new Map(channels.map((c) => [c.channel, c]));
  return waveforms
    .filter((w) => w.time_s.length > 0)
    .sort((a, b) => a.channel - b.channel)
    .map((w) => {
      const cfg = cfgByChannel.get(w.channel);
      return {
        id: channelLabel(w.channel),
        kind: "channel" as const,
        channel: w.channel,
        label: channelLabel(w.channel),
        color: channelColor(w.channel),
        x: Float64Array.from(w.time_s),
        y: Float64Array.from(w.voltage_V),
        xUnit: "s" as const,
        yUnit: "V" as const,
        scale: cfg
          ? { perDiv: cfg.scale_v_div, offset: cfg.offset_v }
          : undefined,
        coupling: cfg?.coupling,
        probe: cfg?.probe_attenuation,
      };
    });
}

/**
 * Derives the sample rate from a trace's time axis.
 * @param trace - A time-domain trace
 * @returns Samples per second, or 0 when it cannot be determined
 */
export function sampleRateOf(trace: Trace): number {
  if (trace.x.length < 2) return 0;
  const dt = trace.x[1] - trace.x[0];
  return dt > 0 ? 1 / dt : 0;
}
