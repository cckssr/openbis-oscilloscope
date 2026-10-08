import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NumericInput, type NumericInputProps } from "./NumericInput";
import { SEC_PER_DIV_STEPS, VOLT_PER_DIV_STEPS, formatPerDiv } from "../../lib/units";

afterEach(cleanup);

/** Controlled wrapper like a real panel: commits update the value. */
function Harness(
  props: Partial<NumericInputProps> & { initial: number; log?: (v: number) => void },
) {
  const { initial, log, ...rest } = props;
  const [value, setValue] = useState(initial);
  return (
    <NumericInput
      aria-label="Wert"
      value={value}
      onCommit={(v) => {
        log?.(v);
        setValue(v);
      }}
      {...rest}
    />
  );
}

const field = () => screen.getByRole("textbox") as HTMLInputElement;
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });
const commitByBlur = () => fireEvent.blur(field());

describe("NumericInput", () => {
  it("A1: lets you type a leading minus and commits -0.5 on blur", () => {
    const log = vi.fn();
    render(<Harness initial={0.3} unit="V" step={0.1} min={-10} max={10} log={log} />);
    fireEvent.focus(field());
    type("-");
    expect(field().value).toBe("-"); // no immediate parse to 0
    type("-0.5");
    expect(log).not.toHaveBeenCalled(); // nothing committed while typing
    commitByBlur();
    expect(log).toHaveBeenCalledExactlyOnceWith(-0.5);
    expect(field().value).toBe("-0,5");
  });

  it("does not turn an emptied field into 0", () => {
    const log = vi.fn();
    render(<Harness initial={1} step={0.1} log={log} />);
    fireEvent.focus(field());
    type("");
    expect(field().value).toBe("");
    commitByBlur();
    expect(log).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Keine gültige Zahl");
  });

  it("A2: steps down through the 1-2-5 sequence below 0.5 V/div", () => {
    const log = vi.fn();
    render(
      <Harness initial={1} unit="V/div" steps={VOLT_PER_DIV_STEPS} min={0.001} max={10} log={log} />,
    );
    const down = screen.getByRole("button", { name: "Wert verringern" });
    for (let i = 0; i < 4; i++) fireEvent.click(down);
    expect(log.mock.calls.map((c) => c[0])).toEqual([0.5, 0.2, 0.1, 0.05]);
  });

  it("A2: steps up along the s/div sequence", () => {
    const log = vi.fn();
    render(<Harness initial={1e-7} steps={SEC_PER_DIV_STEPS} log={log} />);
    const up = screen.getByRole("button", { name: "Wert erhöhen" });
    fireEvent.click(up);
    fireEvent.click(up);
    expect(log.mock.calls.map((c) => c[0])).toEqual([2e-7, 5e-7]);
  });

  it("disables the stepper at the ends of the range", () => {
    render(<Harness initial={10} steps={VOLT_PER_DIV_STEPS} min={0.001} max={10} />);
    expect((screen.getByRole("button", { name: "Wert erhöhen" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Wert verringern" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("A3: linear steps do not accumulate float error", () => {
    const log = vi.fn();
    render(<Harness initial={0} step={0.1} log={log} />);
    const up = screen.getByRole("button", { name: "Wert erhöhen" });
    for (let i = 0; i < 3; i++) fireEvent.click(up);
    expect(log.mock.calls.map((c) => c[0])).toEqual([0.1, 0.2, 0.3]);
    expect(field().value).toBe("0,3");
  });

  it("accepts a decimal comma", () => {
    const log = vi.fn();
    render(<Harness initial={0} step={0.1} log={log} />);
    type("1,25");
    commitByBlur();
    expect(log).toHaveBeenCalledExactlyOnceWith(1.25);
  });

  it("accepts SI suffixes and unit text", () => {
    const log = vi.fn();
    render(<Harness initial={1} unit="V" step={0.1} log={log} />);
    type("200m");
    commitByBlur();
    type("5 µV");
    commitByBlur();
    expect(log.mock.calls.map((c) => c[0])).toEqual([0.2, 5e-6]);
  });

  it("accepts an SI value in a V/div field", () => {
    const log = vi.fn();
    render(<Harness initial={1} unit="V/div" step={0.1} log={log} />);
    type("200 mV");
    commitByBlur();
    expect(log).toHaveBeenCalledExactlyOnceWith(0.2);
  });

  it("rejects invalid text and keeps the draft with an inline message", () => {
    const log = vi.fn();
    render(<Harness initial={1} step={0.1} log={log} />);
    type("abc");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(log).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Keine gültige Zahl");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(field().value).toBe("abc");
  });

  it("shows range errors like 'max. 10 V' without committing", () => {
    const log = vi.fn();
    render(<Harness initial={1} unit="V" step={0.1} min={-10} max={10} log={log} />);
    type("11");
    commitByBlur();
    expect(log).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("max. 10 V");
    type("-11");
    commitByBlur();
    expect(screen.getByRole("alert").textContent).toBe("min. -10 V");
  });

  it("Escape reverts the draft", () => {
    const log = vi.fn();
    render(<Harness initial={2} step={0.1} log={log} />);
    fireEvent.focus(field());
    type("7");
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(field().value).toBe("2");
    commitByBlur();
    expect(log).not.toHaveBeenCalled();
  });

  it("ArrowUp/ArrowDown step the value", () => {
    const log = vi.fn();
    render(<Harness initial={1} step={0.5} log={log} />);
    fireEvent.keyDown(field(), { key: "ArrowUp" });
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(log.mock.calls.map((c) => c[0])).toEqual([1.5, 1, 0.5]);
  });

  it("follows external value changes but keeps an in-progress draft while focused", () => {
    const { rerender } = render(<NumericInput aria-label="Wert" value={1} onCommit={() => {}} />);
    rerender(<NumericInput aria-label="Wert" value={2} onCommit={() => {}} />);
    expect(field().value).toBe("2");
    fireEvent.focus(field());
    type("3,");
    rerender(<NumericInput aria-label="Wert" value={4} onCommit={() => {}} />);
    expect(field().value).toBe("3,");
    fireEvent.blur(field());
  });

  it("uses a custom formatter instead of the unit adornment", () => {
    render(
      <NumericInput
        aria-label="Wert"
        value={0.2}
        unit="V/div"
        format={(v) => formatPerDiv(v, "V")}
        onCommit={() => {}}
      />,
    );
    expect(field().value).toBe("200 mV/div");
  });

  it("does nothing when disabled", () => {
    const log = vi.fn();
    render(<Harness initial={1} disabled log={log} />);
    expect(field().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Wert erhöhen" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
