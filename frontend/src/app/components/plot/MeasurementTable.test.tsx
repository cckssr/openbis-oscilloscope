import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Trace } from "../../../lib/trace";
import { ExportMenu } from "./ExportMenu";
import { MeasurementTable } from "./MeasurementTable";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function sine(id: string, f: number, amp: number): Trace {
  const n = 5000;
  const x = Float64Array.from({ length: n }, (_, i) => i * 1e-6);
  const y = Float64Array.from(x, (t) => amp * Math.sin(2 * Math.PI * f * t));
  return {
    id,
    kind: "channel",
    label: id,
    color: "#123456",
    x,
    y,
    xUnit: "s",
    yUnit: "V",
  };
}

describe("MeasurementTable", () => {
  it("shows Vpp, Frequenz and Effektivwert per channel by default", async () => {
    render(<MeasurementTable traces={[sine("CH1", 1000, 1)]} level="basic" />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Vpp")).toBeTruthy();
    expect(within(table).getByText("Frequenz")).toBeTruthy();
    expect(within(table).getByText("Effektivwert")).toBeTruthy();
    await waitFor(() => expect(within(table).getByText("1 kHz")).toBeTruthy(), {
      timeout: 3000,
    });
    expect(within(table).getByText("2 V")).toBeTruthy();
  });

  it("shows a dash when a value is not computable", async () => {
    const dc: Trace = {
      ...sine("CH1", 1000, 1),
      y: new Float64Array(5000).fill(1.5),
    };
    render(<MeasurementTable traces={[dc]} level="basic" />);
    await waitFor(
      () =>
        expect(within(screen.getByRole("table")).getByText("0 V")).toBeTruthy(),
      { timeout: 3000 },
    );
    expect(
      within(screen.getByRole("table")).getAllByText("—").length,
    ).toBeGreaterThan(0);
  });

  it("explains the empty state", () => {
    render(<MeasurementTable traces={[]} level="basic" />);
    expect(screen.getByText("Keine Kanäle zum Messen.")).toBeTruthy();
  });
});

describe("ExportMenu", () => {
  it("is disabled with an explanation when nothing can be exported", () => {
    render(<ExportMenu input={{ baseName: "x" }} />);
    const button = screen.getByRole("button", { name: /Exportieren/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("title")).toMatch(/Daten/);
  });

  it("is enabled when traces are present", () => {
    render(
      <ExportMenu input={{ baseName: "x", traces: [sine("CH1", 1000, 1)] }} />,
    );
    expect(
      (screen.getByRole("button", { name: /Exportieren/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
