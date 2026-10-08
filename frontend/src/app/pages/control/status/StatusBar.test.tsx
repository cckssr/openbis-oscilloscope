import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { StatusBar } from "./StatusBar";
import { LiveStatusBadge } from "./LiveStatusBadge";
import { formatAge } from "./age";
import {
  FakeSession,
  heldState,
  makeCapture,
  makeJob,
} from "../actions/testing";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeSession }));
vi.mock("../actions/session", (orig) =>
  import("../actions/testing").then((m) => m.sessionMock(orig, () => h.fake)),
);

beforeEach(() => {
  h.fake = new FakeSession(heldState());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("StatusBar", () => {
  it("shows 'Bereit' when idle", () => {
    render(<StatusBar deviceId="scope-01" />);
    expect(screen.getByTestId("status-ready").textContent).toBe("Bereit");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("shows the busy label when no job is known", () => {
    h.fake = new FakeSession(
      heldState({ busy: "Einstellung wird übernommen…" }),
    );
    render(<StatusBar deviceId="scope-01" />);
    expect(screen.getByTestId("status-busy").textContent).toBe(
      "Einstellung wird übernommen…",
    );
  });

  it("shows a determinate progress bar and a working cancel button", () => {
    h.fake = new FakeSession(
      heldState({
        jobs: [makeJob({ progress: 0.5, detail: "Kanal 1 von 2" })],
      }),
    );
    render(<StatusBar deviceId="scope-01" />);
    expect(screen.getByTestId("status-label").textContent).toBe(
      "Volle Auflösung wird gelesen…",
    );
    expect(screen.getByTestId("status-progress")).toBeTruthy();
    expect(screen.getByText("50 %")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(h.fake.actions.cancelFullResolution).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner with elapsed time when no progress is known and no cancel for plain jobs", () => {
    h.fake = new FakeSession(
      heldState({
        jobs: [
          makeJob({
            kind: "capture",
            label: "Aufnahme wird gespeichert…",
            cancellable: false,
          }),
        ],
      }),
    );
    render(<StatusBar deviceId="scope-01" />);
    expect(screen.queryByTestId("status-progress")).toBeNull();
    expect(screen.getByTestId("status-elapsed").textContent).toMatch(/^seit /);
    expect(screen.queryByRole("button", { name: "Abbrechen" })).toBeNull();
  });

  it("prefers a specific running job over a long series", () => {
    h.fake = new FakeSession(
      heldState({
        jobs: [
          makeJob({
            id: "s",
            kind: "series",
            label: "Serienaufnahme läuft…",
            cancellable: false,
          }),
          makeJob({
            id: "c",
            kind: "capture",
            label: "Aufnahme wird gespeichert…",
            cancellable: false,
          }),
        ],
      }),
    );
    render(<StatusBar deviceId="scope-01" />);
    expect(screen.getByTestId("status-label").textContent).toBe(
      "Aufnahme wird gespeichert…",
    );
  });

  it("shows the result of a finished job and lets it be dismissed", () => {
    h.fake = new FakeSession(
      heldState({
        lastCapture: makeCapture({ number: 5 }),
        jobs: [
          makeJob({ kind: "capture", status: "done", cancellable: false }),
        ],
      }),
    );
    render(<StatusBar deviceId="scope-01" />);
    expect(screen.getByTestId("status-result").textContent).toBe(
      "Aufnahme #5 gespeichert",
    );
    fireEvent.click(screen.getByRole("button", { name: "Meldung schließen" }));
    expect(h.fake.actions.dismissJob).toHaveBeenCalledWith("job-1");
  });

  it("shows a failure with its message", () => {
    h.fake = new FakeSession(
      heldState({
        jobs: [
          makeJob({
            kind: "screenshot",
            status: "error",
            error: "Gerät antwortet nicht",
            cancellable: false,
          }),
        ],
      }),
    );
    render(<StatusBar deviceId="scope-01" />);
    expect(screen.getByTestId("status-result").textContent).toBe(
      "Bildschirmfoto fehlgeschlagen: Gerät antwortet nicht",
    );
  });

  it("updates when the job progresses", () => {
    h.fake = new FakeSession(heldState({ jobs: [makeJob({ progress: 0.1 })] }));
    render(<StatusBar deviceId="scope-01" />);
    act(() => h.fake.set({ jobs: [makeJob({ progress: 0.8 })] }));
    expect(screen.getByText("80 %")).toBeTruthy();
  });
});

describe("LiveStatusBadge", () => {
  it("renders nothing while live is off", () => {
    const { container } = render(<LiveStatusBadge deviceId="scope-01" />);
    expect(container.textContent).toBe("");
  });

  it("shows LIVE with the frame age and turns amber 'veraltet' after 3 s", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T14:00:00Z"));
    h.fake = new FakeSession(
      heldState({ live: { status: "on", lastFrameAt: Date.now() - 800 } }),
    );
    render(<LiveStatusBadge deviceId="scope-01" />);
    const badge = screen.getByTestId("live-badge");
    expect(badge.textContent).toContain("LIVE");
    expect(badge.getAttribute("data-state")).toBe("on");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(badge.textContent).toContain("aktualisiert vor 1,1 s");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(badge.getAttribute("data-state")).toBe("stale");
    expect(badge.textContent).toContain("veraltet");
  });

  it("shows 'pausiert' while paused", () => {
    h.fake = new FakeSession(heldState({ live: { status: "paused" } }));
    render(<LiveStatusBadge deviceId="scope-01" />);
    expect(screen.getByTestId("live-badge").textContent).toBe("pausiert");
  });
});

describe("formatAge", () => {
  it("formats with a decimal comma below 10 s", () => {
    expect(formatAge(800)).toBe("0,8 s");
    expect(formatAge(12_400)).toBe("12 s");
    expect(formatAge(65_000)).toBe("1 min 05 s");
  });
});
