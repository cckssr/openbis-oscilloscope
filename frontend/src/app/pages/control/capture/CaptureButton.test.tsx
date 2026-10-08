import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CaptureButton } from "./CaptureButton";
import { FakeSession, heldState, makeJob } from "../actions/testing";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeSession, toast: vi.fn() }));
vi.mock("../actions/session", (orig) =>
  import("../actions/testing").then((m) => m.sessionMock(orig, () => h.fake)),
);
vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));
vi.mock("./screenshotToast", () => ({ showScreenshotToast: h.toast }));

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  h.fake = new FakeSession(heldState());
  h.toast.mockReset();
});
afterEach(cleanup);

const openMenu = () => {
  const trigger = screen.getByRole("button", { name: "Weitere Aufnahmearten" });
  fireEvent.keyDown(trigger, { key: "Enter" });
};

describe("CaptureButton", () => {
  it("saves a capture with the primary button", () => {
    render(<CaptureButton deviceId="scope-01" layout="column" />);
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme speichern" }));
    expect(h.fake.actions.saveCapture).toHaveBeenCalledTimes(1);
  });

  it("shows a visible helper line in the column layout only", () => {
    const { unmount } = render(<CaptureButton deviceId="scope-01" layout="column" />);
    expect(screen.getByText(/Speichert das aktuelle Bild als Aufnahme/)).toBeTruthy();
    unmount();
    render(<CaptureButton deviceId="scope-01" layout="rail" />);
    expect(screen.queryByText(/Speichert das aktuelle Bild als Aufnahme/)).toBeNull();
  });

  it("shows a spinner and 'Wird gespeichert…' while saving", () => {
    h.fake = new FakeSession(
      heldState({
        jobs: [makeJob({ kind: "capture", label: "Aufnahme wird gespeichert…", cancellable: false })],
        busy: "Aufnahme wird gespeichert…",
      }),
    );
    render(<CaptureButton deviceId="scope-01" layout="column" />);
    const button = screen.getByTestId("capture-save") as HTMLButtonElement;
    expect(button.textContent).toBe("Wird gespeichert…");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("is disabled with a reason until the device is taken", () => {
    h.fake = new FakeSession(heldState({ lock: { status: "none" } }));
    render(<CaptureButton deviceId="scope-01" layout="column" />);
    expect((screen.getByTestId("capture-save") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("Zuerst Gerät übernehmen").length).toBeGreaterThan(0);
  });

  it("offers full resolution and screenshot in the split menu", () => {
    render(<CaptureButton deviceId="scope-01" layout="column" />);
    openMenu();
    expect(screen.getByText("Volle Auflösung (langsam)…")).toBeTruthy();
    expect(screen.getByText("Bildschirmfoto des Oszilloskops")).toBeTruthy();
  });

  it("opens the full-resolution dialog from the menu", () => {
    render(<CaptureButton deviceId="scope-01" layout="column" />);
    openMenu();
    fireEvent.click(screen.getByText("Volle Auflösung (langsam)…"));
    expect(screen.getByText("Volle Auflösung lesen")).toBeTruthy();
  });

  it("saves a screenshot once and shows the thumbnail toast", async () => {
    h.fake.actions.saveScreenshot.mockResolvedValue({ artifactId: "art-9" });
    render(<CaptureButton deviceId="scope-01" layout="column" />);
    openMenu();
    await act(async () => {
      fireEvent.click(screen.getByText("Bildschirmfoto des Oszilloskops"));
    });
    expect(h.fake.actions.saveScreenshot).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith({
      token: "tok",
      sessionId: "sess-1",
      artifactId: "art-9",
      deviceId: "scope-01",
    });
  });

  it("hides the screenshot entry when the device cannot take one", () => {
    h.fake = new FakeSession(heldState({ capabilities: ["run", "stop", "acquire", "preview"] }));
    render(<CaptureButton deviceId="scope-01" layout="column" />);
    openMenu();
    expect(screen.queryByText("Bildschirmfoto des Oszilloskops")).toBeNull();
  });
});
