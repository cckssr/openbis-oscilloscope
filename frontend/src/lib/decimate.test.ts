import { describe, expect, it } from "vitest";
import { decimateMinMax, lowerBound } from "./decimate";

function ramp(n: number): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = i * 1e-6;
    y[i] = Math.sin(i / 200);
  }
  return { x, y };
}

describe("decimateMinMax", () => {
  it("returns a view when the data already fits", () => {
    const { x, y } = ramp(100);
    const out = decimateMinMax(x, y, 500);
    expect(out.x.length).toBe(100);
    expect(out.y.buffer).toBe(y.buffer);
  });

  it("keeps single-sample spikes (a stride would drop them)", () => {
    const { x, y } = ramp(1_000_000);
    y[333_333] = 25;
    y[777_777] = -40;
    const out = decimateMinMax(x, y, 2000);
    expect(out.y.length).toBeLessThanOrEqual(2000);
    expect(Math.max(...out.y)).toBe(25);
    expect(Math.min(...out.y)).toBe(-40);
  });

  it("produces monotonic x and respects the point budget", () => {
    const { x, y } = ramp(250_001);
    const out = decimateMinMax(x, y, 1800);
    expect(out.x.length).toBeLessThanOrEqual(1800);
    for (let i = 1; i < out.x.length; i++) {
      expect(out.x[i]).toBeGreaterThan(out.x[i - 1]);
    }
  });

  it("re-decimates the zoom window with full detail", () => {
    const { x, y } = ramp(1_000_000);
    const lo = x[400_000];
    const hi = x[400_900];
    const out = decimateMinMax(x, y, 2000, lo, hi);
    // 900 samples fit into the budget: all of them (plus edge neighbours).
    expect(out.x.length).toBeGreaterThanOrEqual(900);
    expect(out.x[0]).toBeLessThanOrEqual(lo);
    expect(out.x[out.x.length - 1]).toBeGreaterThanOrEqual(hi);
  });

  it("handles empty input and NaN-only buckets", () => {
    expect(decimateMinMax(new Float64Array(0), new Float64Array(0), 100).x.length).toBe(0);
    const x = Float64Array.from({ length: 1000 }, (_, i) => i);
    const y = new Float64Array(1000).fill(NaN);
    const out = decimateMinMax(x, y, 100);
    expect(out.x.length).toBeGreaterThan(0);
    expect(out.y.every(Number.isNaN)).toBe(true);
  });
});

describe("lowerBound", () => {
  it("finds the first index >= value", () => {
    const x = Float64Array.from([1, 2, 4, 8]);
    expect(lowerBound(x, 0)).toBe(0);
    expect(lowerBound(x, 4)).toBe(2);
    expect(lowerBound(x, 5)).toBe(3);
    expect(lowerBound(x, 9)).toBe(4);
  });
});
