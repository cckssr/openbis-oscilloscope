import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useNavigate } from "react-router";
import { LeaveGuardDialog } from "./LeaveGuardDialog";
import { FakeSession, heldState, makeJob } from "../actions/testing";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeSession }));
vi.mock("../actions/session", (orig) =>
  import("../actions/testing").then((m) => m.sessionMock(orig, () => h.fake)),
);

function Control() {
  const navigate = useNavigate();
  return (
    <>
      <LeaveGuardDialog deviceId="scope-01" />
      <button onClick={() => void navigate("/archive")}>zum Archiv</button>
    </>
  );
}

const renderPage = () => {
  const router = createMemoryRouter(
    [
      { path: "/device", element: <Control /> },
      { path: "/archive", element: <p>Archiv-Seite</p> },
    ],
    { initialEntries: ["/device"] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

const running = () =>
  h.fake.set({ jobs: [makeJob({ kind: "full-resolution" })], busy: "Volle Auflösung wird gelesen…" });

const beforeUnload = () => {
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  window.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  h.fake = new FakeSession(heldState());
});
afterEach(cleanup);

describe("LeaveGuardDialog", () => {
  it("lets the user leave freely while nothing runs (live alone does not block)", () => {
    h.fake = new FakeSession(heldState({ live: { status: "on" } }));
    const router = renderPage();
    fireEvent.click(screen.getByText("zum Archiv"));
    expect(router.state.location.pathname).toBe("/archive");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks before leaving during a full-resolution read and stays on 'Bleiben'", async () => {
    h.fake = new FakeSession(heldState({ jobs: [makeJob()] }));
    const router = renderPage();
    await act(async () => fireEvent.click(screen.getByText("zum Archiv")));
    expect(screen.getByText("Eine Aufnahme läuft noch. Seite trotzdem verlassen?")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/device");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Bleiben" })));
    expect(router.state.location.pathname).toBe("/device");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("leaves with 'Verlassen' while a series runs", async () => {
    h.fake = new FakeSession(heldState({ series: { status: "on", runId: "r", count: 2 } }));
    const router = renderPage();
    await act(async () => fireEvent.click(screen.getByText("zum Archiv")));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verlassen" })));
    expect(router.state.location.pathname).toBe("/archive");
    expect(screen.getByText("Archiv-Seite")).toBeTruthy();
  });

  it("arms the tab-close prompt only while something runs", () => {
    renderPage();
    expect(beforeUnload().defaultPrevented).toBe(false);
    act(() => running());
    expect(beforeUnload().defaultPrevented).toBe(true);
    act(() => h.fake.set({ jobs: [], busy: null }));
    expect(beforeUnload().defaultPrevented).toBe(false);
  });
});
