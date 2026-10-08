import { describe, expect, it } from "vitest";
import {
  formatPerDiv,
  formatSI,
  parseSI,
  roundSig,
  roundToStep,
  sequence125,
  stepInSequence,
  VOLT_PER_DIV_STEPS,
} from "./units";

describe("formatSI", () => {
  it("uses SI prefixes and a decimal comma", () => {
    expect(formatSI(0.2, "V")).toBe("200 mV");
    expect(formatSI(0.0002, "V")).toBe("200 µV");
    expect(formatSI(1.5e3, "Hz")).toBe("1,5 kHz");
    expect(formatSI(1e8, "Sa/s")).toBe("100 MSa/s");
    expect(formatSI(-0.5, "V")).toBe("-500 mV");
    expect(formatSI(0, "V")).toBe("0 V");
  });
  it("rounds 999 ns span to 1 µs (A9)", () => {
    expect(formatPerDiv(9.99e-7, "s")).toBe("999 ns/div");
    expect(formatPerDiv(9.9999e-7, "s")).toBe("1 µs/div");
  });
});

describe("parseSI", () => {
  it("accepts negatives, comma and suffixes (A1)", () => {
    expect(parseSI("-0.5")).toBe(-0.5);
    expect(parseSI("-0,5")).toBe(-0.5);
    expect(parseSI("200m")).toBe(0.2);
    expect(parseSI("5µ")).toBe(5e-6);
    expect(parseSI("5u")).toBe(5e-6);
    expect(parseSI("200 mV", "V")).toBe(0.2);
    expect(parseSI("1e-3")).toBe(0.001);
  });
  it("rejects partial input", () => {
    expect(parseSI("-")).toBeNull();
    expect(parseSI("")).toBeNull();
    expect(parseSI("abc")).toBeNull();
    expect(parseSI("5x")).toBeNull();
  });
});

describe("rounding", () => {
  it("removes float drift (A3)", () => {
    expect(roundSig(0.1 + 0.2)).toBe(0.3);
    expect(roundToStep(0.30000000000000004, 0.1)).toBe(0.3);
  });
});

describe("1-2-5 stepping", () => {
  it("builds the knob sequence", () => {
    expect(sequence125(1e-3, 1e-1)).toEqual([
      0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1,
    ]);
  });
  it("steps below 0.5 V/div (A2)", () => {
    let v = 1;
    v = stepInSequence(VOLT_PER_DIV_STEPS, v, -1);
    expect(v).toBe(0.5);
    v = stepInSequence(VOLT_PER_DIV_STEPS, v, -1);
    expect(v).toBe(0.2);
    expect(stepInSequence(VOLT_PER_DIV_STEPS, 0.3, 1)).toBe(0.5);
    expect(stepInSequence(VOLT_PER_DIV_STEPS, 0.001, -1)).toBe(0.001);
  });
});
