/** Level and statistics measurements: Vpp, Vmax, Vmin, Mittelwert, Effektivwert. */
import type { Trace } from "../trace";
import type { Analysis, Measurement } from "./types";
import { extrema, wholePeriodWindow } from "./signal";

function single(
  id: string,
  label: string,
  trace: Trace,
  value: number,
): { values: Measurement[] } {
  return {
    values: [{ id, label, value, unit: trace.yUnit, traceId: trace.id }],
  };
}

export const vpp: Analysis = {
  id: "vpp",
  label: "Vpp",
  unit: "",
  level: "basic",
  inputs: { traces: 1 },
  compute([t]) {
    const e = extrema(t.y);
    return single("vpp", "Vpp", t, e.count ? e.max - e.min : NaN);
  },
};

export const vmax: Analysis = {
  id: "vmax",
  label: "Vmax",
  unit: "",
  level: "basic",
  inputs: { traces: 1 },
  compute([t]) {
    const e = extrema(t.y);
    return single("vmax", "Vmax", t, e.count ? e.max : NaN);
  },
};

export const vmin: Analysis = {
  id: "vmin",
  label: "Vmin",
  unit: "",
  level: "basic",
  inputs: { traces: 1 },
  compute([t]) {
    const e = extrema(t.y);
    return single("vmin", "Vmin", t, e.count ? e.min : NaN);
  },
};

export const mean: Analysis = {
  id: "mean",
  label: "Mittelwert",
  unit: "",
  level: "basic",
  inputs: { traces: 1 },
  compute([t]) {
    const [from, to] = wholePeriodWindow(t);
    return single("mean", "Mittelwert", t, extrema(t.y, from, to).mean);
  },
};

export const rms: Analysis = {
  id: "rms",
  label: "Effektivwert",
  unit: "",
  level: "basic",
  inputs: { traces: 1 },
  compute([t]) {
    const [from, to] = wholePeriodWindow(t);
    let sum = 0;
    let count = 0;
    for (let i = from; i < to; i++) {
      const v = t.y[i];
      if (!Number.isFinite(v)) continue;
      sum += v * v;
      count++;
    }
    return single(
      "rms",
      "Effektivwert",
      t,
      count ? Math.sqrt(sum / count) : NaN,
    );
  },
};
