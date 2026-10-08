import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Trace } from "../trace";
import { useMeasurements } from "./useMeasurements";

function sine(): Trace {
  const n = 4000;
  const x = Float64Array.from({ length: n }, (_, i) => i * 1e-6);
  const y = Float64Array.from(x, (t) => Math.sin(2 * Math.PI * 1000 * t));
  return {
    id: "CH1",
    kind: "channel",
    label: "CH1",
    color: "#000",
    x,
    y,
    xUnit: "s",
    yUnit: "V",
  };
}

describe("useMeasurements", () => {
  it("computes on the main thread where workers are unavailable (jsdom)", async () => {
    const traces = [sine()];
    const { result } = renderHook(() =>
      useMeasurements(traces, ["vpp", "frequency"], { debounceMs: 0 }),
    );
    await waitFor(() => expect(result.current.get("CH1", "vpp")).toBeDefined());
    expect(result.current.get("CH1", "vpp")?.value).toBeCloseTo(2, 2);
    expect(result.current.get("CH1", "frequency")?.value).toBeCloseTo(1000, -1);
    expect(result.current.computing).toBe(false);
  });

  it("returns nothing without traces or selection", async () => {
    const { result } = renderHook(() =>
      useMeasurements([], ["vpp"], { debounceMs: 0 }),
    );
    await waitFor(() => expect(result.current.computing).toBe(false));
    expect(result.current.measurements).toEqual([]);
  });
});
