import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Package } from "lucide-react";
import { ControlLayout } from "./ControlLayout";
import { breakpointForWidth } from "./useBreakpoint";
import type { ControlSlots } from "./slots";

beforeAll(() => {
  // jsdom has no ResizeObserver; the resizable panels need one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function makeSlots() {
  const actions = vi.fn((layout: string, extras?: ReactNode) => (
    <div data-testid={`actions-${layout}`}>
      actions {layout}
      {extras}
    </div>
  ));
  const inspector = vi.fn(
    ({
      layout,
      initialGroupId,
    }: {
      layout: string;
      initialGroupId?: string;
    }) => (
      <div data-testid={`inspector-${layout}`}>
        inspector {initialGroupId ?? "-"}
      </div>
    ),
  );
  const slots: ControlSlots = {
    header: <div>HEADER</div>,
    banners: null,
    stepper: <div>STEPPER</div>,
    plot: <div>PLOT</div>,
    readouts: <div>READOUTS</div>,
    statusbar: <div>STATUS</div>,
    actions: actions as ControlSlots["actions"],
    inspector: inspector as ControlSlots["inspector"],
    lastCapture: (layout) => <div>LAST {layout}</div>,
  };
  return { slots, actions, inspector };
}

const groups = [{ id: "trigger", label: "Trigger", icon: Package }];

describe("breakpointForWidth", () => {
  it("maps the review's breakpoints", () => {
    expect(breakpointForWidth(1440)).toBe("desktop");
    expect(breakpointForWidth(1280)).toBe("desktop");
    expect(breakpointForWidth(1279)).toBe("landscape");
    expect(breakpointForWidth(1024)).toBe("landscape");
    expect(breakpointForWidth(1023)).toBe("portrait");
    expect(breakpointForWidth(768)).toBe("portrait");
  });
});

describe("ControlLayout slot placement", () => {
  it("desktop: column actions and the inspector side by side with the plot", () => {
    const { slots, actions, inspector } = makeSlots();
    render(
      <ControlLayout slots={slots} groups={groups} breakpoint="desktop" />,
    );
    for (const text of [
      "HEADER",
      "STEPPER",
      "PLOT",
      "READOUTS",
      "STATUS",
      "LAST card",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(actions).toHaveBeenCalledWith("column");
    expect(inspector).toHaveBeenCalledWith({ layout: "tabs" });
    expect(screen.getByLabelText("Aktionen einklappen")).toBeTruthy();
    expect(screen.getByLabelText("Einstellungen einklappen")).toBeTruthy();
  });

  it("landscape: icon rail, inspector only in a sheet opened from the rail", () => {
    const { slots, actions, inspector } = makeSlots();
    render(
      <ControlLayout slots={slots} groups={groups} breakpoint="landscape" />,
    );
    expect(actions).toHaveBeenCalledWith("rail", expect.anything());
    expect(inspector).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Trigger/ }));
    expect(inspector).toHaveBeenCalledWith({
      layout: "tabs",
      initialGroupId: "trigger",
    });
    expect(screen.getByTestId("inspector-tabs")).toBeTruthy();
  });

  it("portrait: bottom action bar with Notiz and Einstellungen, accordion in a sheet", () => {
    const { slots, actions, inspector } = makeSlots();
    render(
      <ControlLayout slots={slots} groups={groups} breakpoint="portrait" />,
    );
    expect(actions).toHaveBeenCalledWith("bar", expect.anything());
    expect(screen.getByRole("button", { name: "Notiz" })).toBeTruthy();
    expect(inspector).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    expect(inspector).toHaveBeenCalledWith({ layout: "accordion" });
  });

  it("portrait: Notiz opens the compact last-capture card in a sheet", () => {
    const { slots } = makeSlots();
    render(
      <ControlLayout slots={slots} groups={groups} breakpoint="portrait" />,
    );
    expect(screen.queryByText("LAST compact")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Notiz" }));
    expect(screen.getByText("LAST compact")).toBeTruthy();
  });
});
