import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { getControlGroups } from "../index";
import { makeContext } from "../testing";
import type {
  EnumControlDef,
  NumberControlDef,
  ToggleControlDef,
} from "../types";
import type {
  SettingStatus,
  SettingValue,
} from "../../state/deviceSession/types";
import { ControlStatus } from "./ControlStatus";
import { EnumControl } from "./EnumControl";
import { NumberControl } from "./NumberControl";
import { ToggleControl } from "./ToggleControl";

const fake = vi.hoisted(() => ({
  value: undefined as SettingValue | undefined,
  status: undefined as SettingStatus | undefined,
  set: vi.fn(),
}));
vi.mock("../store", () => ({
  useSetting: () => ({
    value: fake.value,
    applied: fake.value,
    status: fake.status,
    set: fake.set,
  }),
}));

const groups = getControlGroups({
  level: "expert",
  capabilities: [],
  channelCount: 4,
});
const find = <T,>(group: string, key: string) =>
  groups.find((g) => g.id === group)!.controls.find((c) => c.key === key) as T;

beforeEach(() => {
  fake.value = undefined;
  fake.status = undefined;
  fake.set.mockReset();
});
afterEach(cleanup);

describe("NumberControl", () => {
  const def = find<NumberControlDef>("channels", "scale_v_div");
  const renderScale = (disabled = false) =>
    render(
      <NumberControl
        deviceId="scope-01"
        def={def}
        path="channels.1.scale_v_div"
        ctx={makeContext(4, 1)}
        disabled={disabled}
      />,
    );

  it("shows the value with SI units", () => {
    fake.value = 0.2;
    renderScale();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "200 mV/div",
    );
  });

  it("commits typed values through set()", () => {
    fake.value = 0.2;
    renderScale();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "500m" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fake.set).toHaveBeenCalledWith(0.5);
  });

  it("steps along the 1-2-5 sequence with the + button", () => {
    fake.value = 0.2;
    renderScale();
    fireEvent.click(screen.getByRole("button", { name: /erhöhen/ }));
    expect(fake.set).toHaveBeenCalledWith(0.5);
  });

  it("rejects out-of-range input without calling set()", () => {
    fake.value = 0.2;
    renderScale();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fake.set).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/max\./);
  });

  it("is read-only when disabled", () => {
    fake.value = 0.2;
    renderScale(true);
    expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(
      true,
    );
  });

  it("uses a step of V/div / 10 for the offset", () => {
    fake.value = 0;
    render(
      <NumberControl
        deviceId="scope-01"
        def={find<NumberControlDef>("channels", "offset_v")}
        path="channels.1.offset_v"
        ctx={makeContext(4, 1)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /erhöhen/ }));
    expect(fake.set).toHaveBeenCalledWith(0.02);
  });
});

describe("EnumControl", () => {
  const def = find<EnumControlDef>("trigger", "source");
  const renderSource = (channelCount: number) =>
    render(
      <EnumControl
        deviceId="scope-01"
        def={def}
        path="trigger.source"
        ctx={makeContext(channelCount)}
      />,
    );

  it("offers trigger sources for each channel of a 2-channel scope", () => {
    fake.value = "CH1";
    renderSource(2);
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "CH1",
      "CH2",
    ]);
  });

  it("offers three sources for a 3-channel scope and sets the clicked one", () => {
    fake.value = "CH1";
    renderSource(3);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["CH1", "CH2", "CH3"]);
    fireEvent.click(radios[2]);
    expect(fake.set).toHaveBeenCalledWith("CH3");
  });

  it("writes numeric option values back as numbers", () => {
    fake.value = 1;
    render(
      <EnumControl
        deviceId="scope-01"
        def={find<EnumControlDef>("channels", "probe_attenuation")}
        path="channels.1.probe_attenuation"
        ctx={makeContext(4, 1)}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "10×" }));
    expect(fake.set).toHaveBeenCalledWith(10);
  });

  it("shows the help of the selected trigger mode", () => {
    fake.value = "AUTO";
    render(
      <EnumControl
        deviceId="scope-01"
        def={find<EnumControlDef>("trigger", "mode")}
        path="trigger.mode"
        ctx={makeContext(4)}
      />,
    );
    expect(screen.getByText("Auto: zeigt auch ohne Trigger an.")).toBeTruthy();
  });
});

describe("ToggleControl", () => {
  it("sets the opposite value on click", () => {
    fake.value = true;
    render(
      <ToggleControl
        deviceId="scope-01"
        def={find<ToggleControlDef>("channels", "enabled")}
        path="channels.1.enabled"
        ctx={makeContext(4, 1)}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(fake.set).toHaveBeenCalledWith(false);
  });
});

describe("ControlStatus", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a spinner text while applying", () => {
    render(<ControlStatus status={{ state: "applying", at: Date.now() }} />);
    expect(screen.getByText("wird übernommen …")).toBeTruthy();
  });

  it("shows the error message", () => {
    render(
      <ControlStatus
        status={{ state: "error", error: "Gerät antwortet nicht", at: 1 }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Gerät antwortet nicht",
    );
  });

  it("fades out the applied hint after about two seconds", () => {
    render(<ControlStatus status={{ state: "applied", at: Date.now() }} />);
    expect(screen.getByText("✓ übernommen")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.queryByText("✓ übernommen")).toBeNull();
  });
});
