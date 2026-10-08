import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Device } from "../../../../api/types";

const actions = { takeControl: vi.fn(async () => {}) };
vi.mock("../actions/session", () => ({ useDeviceActions: () => actions }));
vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));

const api = vi.hoisted(() => ({ listDevices: vi.fn(), releaseLock: vi.fn(async () => {}) }));
vi.mock("../../../../api/devices", () => api);

const storeRelease = vi.fn(async () => {});
let peeked: unknown;
vi.mock("../../../state/deviceSession", () => ({
  useDeviceSessionRegistry: () => ({ peek: () => peeked }),
}));

import { OtherLockDialog } from "./OtherLockDialog";
import { useTakeControl } from "./useTakeControl";

const device = (id: string, mine: boolean | null): Device => ({
  id,
  label: `Label ${id}`,
  ip: "",
  port: 1,
  state: mine ? "LOCKED" : "ONLINE",
  last_error: null,
  lock: mine === null ? null : { owner_user: "me", acquired_at: 0, is_mine: mine, ...(mine ? { session_id: `sess-${id}` } : {}) },
});

function Harness() {
  const take = useTakeControl("scope-02");
  return (
    <>
      <button onClick={take.request} disabled={take.checking}>
        übernehmen
      </button>
      <OtherLockDialog {...take.dialog} />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  peeked = undefined;
});
afterEach(cleanup);

describe("useTakeControl", () => {
  it("takes the device right away when nothing else is locked by the user", async () => {
    api.listDevices.mockResolvedValue([device("scope-01", null), device("scope-02", null), device("scope-03", false)]);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "übernehmen" }));
    await waitFor(() => expect(actions.takeControl).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("takes the device when the lock list cannot be read", async () => {
    api.listDevices.mockRejectedValue(new Error("offline"));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "übernehmen" }));
    await waitFor(() => expect(actions.takeControl).toHaveBeenCalledOnce());
  });

  it("asks when another device is locked; 'Abbrechen' takes nothing", async () => {
    api.listDevices.mockResolvedValue([device("scope-01", true), device("scope-02", null)]);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "übernehmen" }));
    expect(await screen.findByText("Du hast „Label scope-01“ bereits übernommen.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(actions.takeControl).not.toHaveBeenCalled();
    expect(api.releaseLock).not.toHaveBeenCalled();
  });

  it("'Beide behalten' takes the device without releasing the other", async () => {
    api.listDevices.mockResolvedValue([device("scope-01", true)]);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "übernehmen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Beide behalten" }));
    expect(actions.takeControl).toHaveBeenCalledOnce();
    expect(api.releaseLock).not.toHaveBeenCalled();
  });

  it("'Anderes freigeben und übernehmen' releases the other device first", async () => {
    api.listDevices.mockResolvedValue([device("scope-01", true)]);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "übernehmen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Anderes freigeben und übernehmen" }));
    await waitFor(() => expect(actions.takeControl).toHaveBeenCalledOnce());
    expect(api.releaseLock).toHaveBeenCalledWith("tok", "scope-01", "sess-scope-01");
  });

  it("releases through the store when this tab holds the other device", async () => {
    peeked = {
      getState: () => ({ lock: { status: storeRelease.mock.calls.length ? "none" : "held" } }),
      actions: { release: storeRelease },
    };
    api.listDevices.mockResolvedValue([device("scope-01", true)]);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "übernehmen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Anderes freigeben und übernehmen" }));
    await waitFor(() => expect(actions.takeControl).toHaveBeenCalledOnce());
    expect(storeRelease).toHaveBeenCalledOnce();
    expect(api.releaseLock).not.toHaveBeenCalled();
  });

  it("does not take the new device when releasing the other one failed", async () => {
    api.listDevices.mockResolvedValue([device("scope-01", true)]);
    api.releaseLock.mockRejectedValueOnce(new Error("boom"));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "übernehmen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Anderes freigeben und übernehmen" }));
    await waitFor(() => expect(api.releaseLock).toHaveBeenCalled());
    expect(actions.takeControl).not.toHaveBeenCalled();
  });
});
