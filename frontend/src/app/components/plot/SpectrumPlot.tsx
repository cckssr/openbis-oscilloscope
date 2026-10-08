import { useMemo } from "react";
import { computeSpectrum } from "../../../lib/analysis/fft";
import { isMeasurable } from "../../../lib/analysis/compute";
import type { Trace } from "../../../lib/trace";
import { WaveformPlot } from "./WaveformPlot";

interface SpectrumPlotProps {
  /** Time-domain traces; their spectra are drawn (non-measurable traces are skipped). */
  traces: Trace[];
  /** Upper frequency shown in Hz; default: 20 × the strongest peak, at most Nyquist. */
  maxFrequency?: number;
  viewKey?: string;
  emptyMessage?: React.ReactNode;
  toolbarExtras?: React.ReactNode;
  className?: string;
}

/** Cuts a spectrum at `fMax` and lifts the noise floor to peak − 120 dB so the y autorange stays useful. */
function limitSpectrum(s: Trace, fMax: number): Trace {
  let end = s.x.length;
  while (end > 1 && s.x[end - 1] > fMax) end--;
  const x = s.x.subarray(0, end);
  const y = Float64Array.from(s.y.subarray(0, end));
  const top = y.reduce((m, v) => (v > m ? v : m), -Infinity);
  for (let i = 0; i < y.length; i++) y[i] = Math.max(y[i], top - 120);
  return { ...s, x, y };
}

/**
 * Amplitude spectrum (dBV over Hz) of time-domain traces: FFT with Hann window,
 * drawn with the same toolbar, zoom/pan and cursors as the waveform plot.
 * @param props - See {@link SpectrumPlotProps}
 * @returns The spectrum plot
 */
export function SpectrumPlot({
  traces,
  maxFrequency,
  viewKey = "spectrum",
  emptyMessage,
  toolbarExtras,
  className,
}: SpectrumPlotProps) {
  const spectra = useMemo(() => {
    const full = traces
      .filter(isMeasurable)
      .map(computeSpectrum)
      .filter((s) => s.x.length > 0);
    if (full.length === 0) return [];
    let fMax = maxFrequency;
    if (fMax === undefined) {
      let peakF = 0;
      let peakV = -Infinity;
      for (const s of full) {
        for (let i = 1; i < s.y.length; i++) {
          if (s.y[i] > peakV) {
            peakV = s.y[i];
            peakF = s.x[i];
          }
        }
      }
      fMax = Math.max(peakF * 20, full[0].x[3] ?? 0);
    }
    return full.map((s) => limitSpectrum(s, fMax));
  }, [traces, maxFrequency]);

  return (
    <WaveformPlot
      traces={spectra}
      yMode="volts"
      viewKey={viewKey}
      showReadouts={false}
      emptyMessage={emptyMessage}
      toolbarExtras={toolbarExtras}
      className={className}
    />
  );
}
