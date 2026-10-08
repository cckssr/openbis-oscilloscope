/** Registers the built-in analyses (side-effect module, imported by compute.ts). */
import { mean, rms, vmax, vmin, vpp } from "./basic";
import "./fft";
import { registerAnalysis } from "./registry";
import { frequency, period, phase, riseTimeAnalysis } from "./timing";

for (const analysis of [
  vpp,
  vmax,
  vmin,
  mean,
  rms,
  frequency,
  period,
  riseTimeAnalysis,
  phase,
]) {
  registerAnalysis(analysis);
}
