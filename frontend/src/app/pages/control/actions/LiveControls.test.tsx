import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { LiveControls } from "./LiveControls";
import { FakeSession, heldState, makeJob } from "./testing";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeSession }));
vi.mock("./session", (orig) =>
  import("./testing").then((m) => m.sessionMock(orig, () => h.fake)),
);

beforeEach(() => {
  h.fake = new FakeSession(heldState());
});
afterEach(cleanup);

const renderControls = (
  level: "basic" | "expert" = "expert",
  layout: "column" | "rail" | "bar" = "column",
) => render(<LiveControls deviceId="scope-01" level={level} layout={layout} />);

describe("LiveControls", () => {
  it("shows a single Live toggle that starts live", () => {
    renderControls();
    expect(screen.queryByRole("button", { name: /Live stoppen/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Live starten/ }));
    expect(h.fake.actions.startLive).toHaveBeenCalledTimes(1);
  });

  it("turns into Live stoppen while live runs and never offers both", () => {
    h.fake = new FakeSession(heldState({ live: { status: "on" } }));
    renderControls();
    expect(screen.queryByRole("button", { name: /Live starten/ })).toBeNull();
    const stop = screen.getByRole("button", { name: /Live stoppen/ });
    expect((stop as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(stop);
    expect(h.fake.actions.stopLive).toHaveBeenCalledTimes(1);
  });

  it("shows the starting state and disables the toggle", () => {
    h.fake = new FakeSession(heldState({ live: { status: "starting" } }));
    renderControls();
    const button = screen.getByRole("button", {
      name: /Live startet/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("explains disabled buttons when the device is not controlled", () => {
    h.fake = new FakeSession(heldState({ lock: { status: "none" } }));
    renderControls();
    expect(
      (
        screen.getByRole("button", {
          name: /Live starten/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: /^Auto-Setup$/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByTestId("live-controls-reason").textContent).toBe(
      "Zuerst Gerät übernehmen",
    );
  });

  it("uses the busy label as reason", () => {
    h.fake = new FakeSession(
      heldState({ busy: "Einstellung wird übernommen…" }),
    );
    renderControls();
    expect(screen.getByTestId("live-controls-reason").textContent).toBe(
      "Einstellung wird übernommen…",
    );
    expect(
      (screen.getByRole("button", { name: /Scope stopp/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("blocks everything while the full resolution is read", () => {
    h.fake = new FakeSession(
      heldState({ jobs: [makeJob()], busy: "Volle Auflösung wird gelesen…" }),
    );
    renderControls();
    expect(screen.getByTestId("live-controls-reason").textContent).toBe(
      "Volle Auflösung wird gelesen…",
    );
    expect(
      (
        screen.getByRole("button", {
          name: /Einzeltrigger/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("keeps Auto-Setup in basic level and hides the expert controls", () => {
    renderControls("basic");
    expect(screen.getByRole("button", { name: /^Auto-Setup$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Scope stopp/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Einzeltrigger/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Trigger erzwingen/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Serienaufnahme/ })).toBeNull();
  });

  it("hides controls the device has no capability for", () => {
    h.fake = new FakeSession(
      heldState({ capabilities: ["run", "stop", "preview", "acquire"] }),
    );
    renderControls();
    expect(screen.queryByRole("button", { name: /^Auto-Setup$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Einzeltrigger/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Serienaufnahme starten/ }),
    ).toBeTruthy();
  });

  it("starts, counts and stops a series", () => {
    renderControls();
    fireEvent.click(
      screen.getByRole("button", { name: /Serienaufnahme starten/ }),
    );
    expect(h.fake.actions.startSeries).toHaveBeenCalled();
    act(() => h.fake.set({ series: { status: "on", runId: "r", count: 3 } }));
    const stop = screen.getByRole("button", {
      name: /Serienaufnahme stoppen · 3 Aufnahmen/,
    });
    fireEvent.click(stop);
    expect(h.fake.actions.stopSeries).toHaveBeenCalled();
  });

  it("calls the scope commands", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: /Scope stopp/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Auto-Setup$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Einzeltrigger/ }));
    fireEvent.click(screen.getByRole("button", { name: /Trigger erzwingen/ }));
    expect(h.fake.actions.stopScope).toHaveBeenCalled();
    expect(h.fake.actions.autoscale).toHaveBeenCalled();
    expect(h.fake.actions.single).toHaveBeenCalled();
    expect(h.fake.actions.forceTrigger).toHaveBeenCalled();
  });

  it("renders in rail and bar layouts with full accessible names", () => {
    const { unmount } = renderControls("expert", "rail");
    expect(screen.getByRole("button", { name: "Live starten" })).toBeTruthy();
    expect(
      screen.getByTestId("live-controls").getAttribute("data-layout"),
    ).toBe("rail");
    unmount();
    renderControls("expert", "bar");
    expect(
      screen.getByTestId("live-controls").getAttribute("data-layout"),
    ).toBe("bar");
  });

  it("labels live and hardware stop differently in the rail", () => {
    h.fake = new FakeSession(heldState({ live: { status: "on" } }));
    renderControls("basic", "rail");
    expect(screen.getByTestId("live-toggle").textContent).toBe("Live aus");
    expect(screen.getByTestId("stop-scope").textContent).toBe("Scope stopp");
  });

  describe("bar layout overflow menu", () => {
    const openMore = () =>
      fireEvent.keyDown(
        screen.getByRole("button", { name: "Weitere Messaktionen" }),
        { key: "Enter" },
      );

    it("moves single, force trigger and series into 'Mehr' in expert level", () => {
      renderControls("expert", "bar");
      expect(screen.queryByTestId("single")).toBeNull();
      expect(screen.queryByTestId("force-trigger")).toBeNull();
      expect(screen.queryByTestId("series")).toBeNull();
      openMore();
      expect(
        screen.getByRole("menuitem", { name: /Einzeltrigger/ }),
      ).toBeTruthy();
      expect(
        screen.getByRole("menuitem", { name: /Trigger erzwingen/ }),
      ).toBeTruthy();
      expect(
        screen.getByRole("menuitem", { name: /Serienaufnahme starten/ }),
      ).toBeTruthy();
    });

    it("runs the command of the chosen entry", () => {
      renderControls("expert", "bar");
      openMore();
      fireEvent.click(screen.getByRole("menuitem", { name: /Einzeltrigger/ }));
      expect(h.fake.actions.single).toHaveBeenCalledTimes(1);
    });

    it("has no menu in basic level", () => {
      renderControls("basic", "bar");
      expect(
        screen.queryByRole("button", { name: "Weitere Messaktionen" }),
      ).toBeNull();
    });

    it("keeps the stop button of a running series in the bar", () => {
      h.fake = new FakeSession(
        heldState({ series: { status: "on", runId: "r", count: 2 } }),
      );
      renderControls("expert", "bar");
      fireEvent.click(
        screen.getByRole("button", {
          name: /Serienaufnahme stoppen · 2 Aufnahmen/,
        }),
      );
      expect(h.fake.actions.stopSeries).toHaveBeenCalled();
      openMore();
      expect(
        screen.queryByRole("menuitem", { name: /Serienaufnahme/ }),
      ).toBeNull();
    });

    it("shows the reason of a disabled entry", () => {
      h.fake = new FakeSession(
        heldState({ busy: "Einstellung wird übernommen…" }),
      );
      renderControls("expert", "bar");
      expect(
        (
          screen.getByRole("button", {
            name: "Weitere Messaktionen",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });
  });
});
