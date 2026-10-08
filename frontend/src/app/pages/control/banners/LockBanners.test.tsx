import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const state = {
  lock: { status: "lost", error: undefined as string | undefined },
};
const actions = { takeControl: vi.fn(async () => {}) };

vi.mock("../../../state/deviceSession", () => ({
  useDeviceSessionSelector: (
    _id: string,
    select: (s: typeof state) => unknown,
  ) => select(state),
}));
vi.mock("../actions/session", () => ({ useDeviceActions: () => actions }));

import { LockLostBanner, PassiveTabBanner } from "./LockBanners";

beforeEach(() => {
  vi.clearAllMocks();
  state.lock = { status: "lost", error: undefined };
});
afterEach(cleanup);

describe("LockLostBanner", () => {
  it("blocks with an alert and retakes control", () => {
    render(<LockLostBanner deviceId="scope-01" />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Verbindung zum Gerät verloren",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Sperre abgelaufen.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Erneut übernehmen" }));
    expect(actions.takeControl).toHaveBeenCalledOnce();
  });

  it("prefers the store's message and hides when the lock is held", () => {
    state.lock = { status: "lost", error: "Heartbeat fehlgeschlagen" };
    const { rerender } = render(<LockLostBanner deviceId="scope-01" />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Heartbeat fehlgeschlagen",
    );
    state.lock = { status: "held", error: undefined };
    rerender(<LockLostBanner deviceId="scope-01" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("PassiveTabBanner", () => {
  it("offers 'Hier übernehmen' only in a passive tab", () => {
    state.lock = { status: "passive", error: undefined };
    render(<PassiveTabBanner deviceId="scope-01" />);
    expect(
      screen.getByText(
        "Dieses Gerät ist bereits in einem anderen Tab geöffnet.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hier übernehmen" }));
    expect(actions.takeControl).toHaveBeenCalledOnce();
    cleanup();
    state.lock = { status: "held", error: undefined };
    render(<PassiveTabBanner deviceId="scope-01" />);
    expect(screen.queryByTestId("passive-banner")).toBeNull();
  });
});
