import { describe, expect, it } from "vitest";
import type { Trace } from "../trace";
import { computeMeasurements } from "./compute";
import { listAnalyses } from "./registry";
import { formatMeasurement } from "./format";
import "./builtins";

/** Deterministic pseudo-noise in [-1, 1]. */
function makeRng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return (s / 4294967296) * 2 - 1;
  };
}

function synth(
  id: string,
  fn: (t: number) => number,
  { n = 5000, dt = 1e-6, noise = 0 }: { n?: number; dt?: number; noise?: number } = {},
): Trace {
  const rng = makeRng(7);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = i * dt;
    y[i] = fn(x[i]) + noise * rng();
  }
  return { id, kind: "channel", label: id, color: "#000", x, y, xUnit: "s", yUnit: "V" };
}

function value(ms: ReturnType<typeof computeMeasurements>, id: string, traceId: string): number {
  const m = ms.find((v) => v.id === id && v.traceId === traceId);
  if (!m) throw new Error(`missing ${id} ${traceId}`);
  return m.value;
}

const sine = (f: number, amp: number, phaseRad = 0, dc = 0) => (t: number) =>
  dc + amp * Math.sin(2 * Math.PI * f * t - phaseRad);

describe("basic measurements", () => {
  const ids = ["vpp", "vmax", "vmin", "mean", "rms", "frequency", "period"];

  it("measures a 1 kHz 2 Vpp sine", () => {
    const t = synth("CH1", sine(1000, 1));
    const ms = computeMeasurements([t], ids);
    expect(value(ms, "vpp", "CH1")).toBeCloseTo(2, 2);
    expect(value(ms, "vmax", "CH1")).toBeCloseTo(1, 2);
    expect(value(ms, "vmin", "CH1")).toBeCloseTo(-1, 2);
    expect(Math.abs(value(ms, "mean", "CH1"))).toBeLessThan(0.01);
    expect(value(ms, "rms", "CH1")).toBeCloseTo(Math.SQRT1_2, 2);
    expect(value(ms, "frequency", "CH1")).toBeCloseTo(1000, -1);
    expect(value(ms, "period", "CH1")).toBeCloseTo(1e-3, 5);
  });

  it("finds the frequency of a noisy sine with offset", () => {
    const t = synth("CH1", sine(1500, 0.5, 0, 0.3), { noise: 0.04 });
    const ms = computeMeasurements([t], ["frequency", "mean"]);
    expect(value(ms, "frequency", "CH1") / 1500).toBeCloseTo(1, 2);
    expect(value(ms, "mean", "CH1")).toBeCloseTo(0.3, 1);
  });

  it("finds the frequency of square and triangle waves", () => {
    const square = synth("CH1", (t) => (Math.floor(t * 2000) % 2 === 0 ? 1 : -1), { noise: 0.05 });
    const tri = synth(
      "CH2",
      (t) => {
        const ph = (t * 1000) % 1;
        return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
      },
      { noise: 0.05 },
    );
    const ms = computeMeasurements([square, tri], ["frequency"]);
    expect(value(ms, "frequency", "CH1") / 1000).toBeCloseTo(1, 2);
    expect(value(ms, "frequency", "CH2") / 1000).toBeCloseTo(1, 2);
  });

  it("returns NaN frequency for noise and DC", () => {
    const rng = makeRng(3);
    const noise = synth("CH1", () => rng() * 0.01);
    const dc = synth("CH2", () => 1.5);
    const ms = computeMeasurements([noise, dc], ["frequency", "period"]);
    expect(Number.isNaN(value(ms, "frequency", "CH1"))).toBe(true);
    expect(Number.isNaN(value(ms, "frequency", "CH2"))).toBe(true);
  });

  it("skips non-time-domain traces", () => {
    const spectrum: Trace = { ...synth("FFT(CH1)", () => 0), kind: "analysis", xUnit: "Hz", yUnit: "dBV" };
    expect(computeMeasurements([spectrum], ["vpp"])).toEqual([]);
  });
});

describe("rise time", () => {
  it("measures 10-90 % of a trapezoidal edge", () => {
    const rise = 20e-6;
    const t = synth(
      "CH1",
      (tt) => {
        const ph = tt % 200e-6;
        if (ph < 50e-6) return 0;
        if (ph < 50e-6 + rise) return (ph - 50e-6) / rise;
        if (ph < 150e-6) return 1;
        if (ph < 150e-6 + rise) return 1 - (ph - 150e-6) / rise;
        return 0;
      },
      { n: 2000, dt: 0.5e-6, noise: 0.005 },
    );
    const ms = computeMeasurements([t], ["rise-time"]);
    // 10-90 % of a linear ramp is 0.8 * ramp time.
    expect(value(ms, "rise-time", "CH1") / (0.8 * rise)).toBeCloseTo(1, 1);
  });
});

describe("phase", () => {
  it("reports +45 deg when the second trace lags by 45 deg", () => {
    const a = synth("CH1", sine(1000, 1));
    const b = synth("CH2", sine(1000, 0.7, Math.PI / 4));
    const ms = computeMeasurements([a, b], ["phase"], "CH1");
    expect(value(ms, "phase", "CH2")).toBeCloseTo(45, 0);
  });

  it("reports -45 deg when the second trace leads", () => {
    const a = synth("CH1", sine(1000, 1));
    const b = synth("CH2", sine(1000, 1, -Math.PI / 4));
    expect(value(computeMeasurements([a, b], ["phase"]), "phase", "CH2")).toBeCloseTo(-45, 0);
  });

  it("is stable near 180 deg and works with a chosen reference", () => {
    const a = synth("CH1", sine(1000, 1), { noise: 0.02 });
    const b = synth("CH2", sine(1000, 1, Math.PI * 0.999), { noise: 0.02 });
    const ms = computeMeasurements([a, b], ["phase"], "CH2");
    expect(Math.abs(Math.abs(value(ms, "phase", "CH1")) - 180)).toBeLessThan(3);
  });
});

describe("registry and formatting", () => {
  it("lists basic analyses for the basic level and all for expert", () => {
    const basic = listAnalyses("basic").map((a) => a.id);
    const expert = listAnalyses("expert").map((a) => a.id);
    expect(basic).toContain("vpp");
    expect(basic).not.toContain("phase");
    expect(expert).toContain("phase");
    expect(expert).toContain("rise-time");
  });

  it("formats values with SI prefixes and a dash for NaN", () => {
    expect(formatMeasurement({ value: 1.414, unit: "V" })).toBe("1,41 V");
    expect(formatMeasurement({ value: 1000, unit: "Hz" })).toBe("1 kHz");
    expect(formatMeasurement({ value: 45, unit: "°" })).toBe("45,0 °");
    expect(formatMeasurement({ value: NaN, unit: "V" })).toBe("—");
  });
});

describe("fft", () => {
  it("puts a 1 kHz 2 Vpp sine at 1 kHz with about -3 dBV", async () => {
    const { computeSpectrum } = await import("./fft");
    const t = synth("CH1", sine(1000, 1), { n: 8192, dt: 1e-6 });
    const s = computeSpectrum(t);
    expect(s.kind).toBe("analysis");
    expect(s.xUnit).toBe("Hz");
    expect(s.yUnit).toBe("dBV");
    let peak = 0;
    for (let i = 1; i < s.y.length; i++) if (s.y[i] > s.y[peak]) peak = i;
    expect(Math.abs(s.x[peak] - 1000)).toBeLessThan(2 * (1e6 / 8192));
    expect(s.y[peak]).toBeGreaterThan(-4);
    expect(s.y[peak]).toBeLessThan(-2);
  });
});
