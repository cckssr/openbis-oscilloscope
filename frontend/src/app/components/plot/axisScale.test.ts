import { describe, expect, it } from "vitest";
import { chooseAxisScale, formatAxisValue } from "./axisScale";

describe("chooseAxisScale", () => {
  it("picks one prefix from the range", () => {
    expect(chooseAxisScale([0, 0.01], "s").suffix).toBe(" ms");
    expect(chooseAxisScale([-5e-6, 5e-6], "s").suffix).toBe(" µs");
    expect(chooseAxisScale([0, 2], "s").suffix).toBe(" s");
    expect(chooseAxisScale([-5e-9, 5e-9], "s").suffix).toBe(" ns");
    expect(chooseAxisScale([0, 30000], "Hz").suffix).toBe(" kHz");
  });

  it("falls back to the base unit for empty or invalid ranges", () => {
    expect(chooseAxisScale([0, 0], "s").factor).toBe(1);
    expect(chooseAxisScale([NaN, NaN], "s").suffix).toBe(" s");
  });
});

describe("formatAxisValue", () => {
  it("formats every tick of an axis with the same prefix", () => {
    const scale = chooseAxisScale([0, 0.01], "s");
    const labels = [0, 0.001, 0.0025, 0.01].map((v) =>
      formatAxisValue(v, scale),
    );
    expect(labels).toEqual(["0 ms", "1 ms", "2,5 ms", "10 ms"]);
  });

  it("uses a real minus sign and removes float noise", () => {
    const scale = chooseAxisScale([-5e-6, 5e-6], "s");
    expect(formatAxisValue(-5e-6, scale)).toBe("−5 µs");
    expect(formatAxisValue(0.30000000000000004e-6, scale)).toBe("0,3 µs");
    expect(formatAxisValue(NaN, scale)).toBe("—");
  });
});
