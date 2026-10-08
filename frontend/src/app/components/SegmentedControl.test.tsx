import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl } from "./SegmentedControl";

afterEach(cleanup);

describe("SegmentedControl", () => {
  it("renders a radiogroup with aria-checked for up to 3 options (string[] still works)", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl aria-label="Kopplung" options={["DC", "AC", "GND"]} value="AC" onChange={onChange} />,
    );
    expect(screen.getByRole("radiogroup", { name: "Kopplung" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "AC" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "GND" }));
    expect(onChange).toHaveBeenCalledWith("GND");
  });

  it("moves selection with arrow keys", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={["A", "B", "C"]} value="A" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "A" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("B");
  });

  it("shows the help of the selected option as visible text", () => {
    render(
      <SegmentedControl
        options={[
          { value: "AUTO", label: "Auto", help: "Läuft auch ohne Trigger" },
          { value: "NORMAL", label: "Normal" },
        ]}
        value="AUTO"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Läuft auch ohne Trigger")).toBeTruthy();
  });

  it("renders a select for more than 3 options or with asSelect", () => {
    const { rerender } = render(
      <SegmentedControl aria-label="Quelle" options={["CH1", "CH2", "CH3", "CH4"]} value="CH1" onChange={() => {}} />,
    );
    expect(screen.getByRole("combobox", { name: "Quelle" })).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    rerender(<SegmentedControl asSelect aria-label="Q" options={["A", "B"]} value="A" onChange={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Q" })).toBeTruthy();
  });

  it("disables all options", () => {
    render(<SegmentedControl disabled options={["A", "B"]} value="A" onChange={() => {}} />);
    expect((screen.getByRole("radio", { name: "B" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
