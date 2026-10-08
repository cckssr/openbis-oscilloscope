/** FFT analysis: amplitude spectrum of a time-domain trace in dBV (re 1 V rms). */
import type { Trace } from "../trace";
import { sampleRateOf } from "../trace";
import { registerAnalysis } from "./registry";
import type { Analysis } from "./types";

/** Longest transform; longer records are cut (first samples are used). */
const MAX_POINTS = 1 << 16;

/** In-place iterative radix-2 FFT; `re.length` must be a power of two. */
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

/**
 * Computes the single-sided amplitude spectrum with a Hann window. A sine of
 * amplitude A shows as a peak of A/√2 (rms) → `20·log10(A/√2)` dBV.
 * @param trace - Uniformly sampled time-domain trace (at least 8 samples)
 * @returns A trace with kind "analysis", x in Hz and y in dBV; empty when the input is unusable
 */
export function computeSpectrum(trace: Trace): Trace {
  const rate = sampleRateOf(trace);
  const n = 1 << Math.floor(Math.log2(Math.min(trace.y.length, MAX_POINTS) || 1));
  const base = {
    id: `FFT(${trace.id})`,
    kind: "analysis" as const,
    label: `FFT(${trace.label})`,
    color: trace.color,
    xUnit: "Hz" as const,
    yUnit: "dBV" as const,
  };
  if (n < 8 || !(rate > 0)) return { ...base, x: new Float64Array(0), y: new Float64Array(0) };

  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let windowSum = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += trace.y[i];
  mean /= n;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    windowSum += w;
    re[i] = (trace.y[i] - mean) * w;
  }
  fftInPlace(re, im);

  const bins = n / 2;
  const x = new Float64Array(bins);
  const y = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    const peak = (2 * Math.hypot(re[k], im[k])) / windowSum;
    x[k] = (k * rate) / n;
    y[k] = 20 * Math.log10(Math.max(peak / Math.SQRT2, 1e-12));
  }
  return { ...base, x, y };
}

export const fft: Analysis = {
  id: "fft",
  label: "FFT",
  unit: "dBV",
  level: "expert",
  inputs: { traces: 1 },
  output: "traces",
  compute([t]) {
    return { traces: [computeSpectrum(t)] };
  },
};

registerAnalysis(fft);
