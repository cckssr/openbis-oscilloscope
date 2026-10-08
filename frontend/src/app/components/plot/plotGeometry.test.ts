import { describe, expect, it } from "vitest";
import { inferScreenFrame } from "./plotGeometry";

describe("inferScreenFrame", () => {
  it("snaps a (N-1)·dt record to a 1-2-5 screen", () => {
    // 1200 samples over 5 ms screen → span 4.9958 ms
    const frame = inferScreenFrame([-2.5e-3, -2.5e-3 + 1199 * (5e-3 / 1200)]);
    expect(frame?.[0]).toBeCloseTo(-2.5e-3, 12);
    expect(frame?.[1]).toBeCloseTo(2.5e-3, 12);
  });
  it("snaps 999 ns spans to 100 ns/div", () => {
    const frame = inferScreenFrame([0, 9.99e-7]);
    expect(frame?.[1]).toBeCloseTo(1e-6, 15);
  });
  it("gives up when no step is close", () => {
    expect(inferScreenFrame([0, 0.0035])).toBeNull();
  });
});
