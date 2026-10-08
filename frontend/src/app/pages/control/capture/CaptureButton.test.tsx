import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CaptureButton } from "./CaptureButton";
import { FullResolutionProvider, useFullResolutionDialog } from "./FullResolutionProvider";
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

/** Renders the button inside the provider that owns the page's one dialog. */
const renderButton = (layout: "column" | "rail" | "bar" = "column") =>
  render(
    <FullResolutionProvider deviceId="scope-01">
      <CaptureButton deviceId="scope-01" layout={layout} />
    </FullResolutionProvider>,
  );

const openMenu = () => {
  const trigger = screen.getByRole("button", { name: "Weitere Aufnahmearten" });
  fireEvent.keyDown(trigger, { key: "Enter" });
};

describe("CaptureButton", () => {
  it("saves a capture with the primary button", () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme speichern" }));
    expect(h.fake.actions.saveCapture).toHaveBeenCalledTimes(1);
  });

  it("shows a visible helper line in the column layout only", () => {
    const { unmount } = renderButton();
    expect(screen.getByText(/Speichert das aktuelle Bild als Aufnahme/)).toBeTruthy();
    unmount();
    renderButton("rail");
    expect(screen.queryByText(/Speichert das aktuelle Bild als Aufnahme/)).toBeNull();
  });

  it("shows a spinner and 'Wird gespeichert…' while saving", () => {
    h.fake = new FakeSession(
      heldState({
        jobs: [makeJob({ kind: "capture", label: "Aufnahme wird gespeichert…", cancellable: false })],
        busy: "Aufnahme wird gespeichert…",
      }),
    );
    renderButton();
    const button = screen.getByTestId("capture-save") as HTMLButtonElement;
    expect(button.textContent).toBe("Wird gespeichert…");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("is disabled with a reason until the device is taken", () => {
    h.fake = new FakeSession(heldState({ lock: { status: "none" } }));
    renderButton();
    expect((screen.getByTestId("capture-save") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("Zuerst Gerät übernehmen").length).toBeGreaterThan(0);
  });

  it("offers full resolution and screenshot in the split menu", () => {
    renderButton();
    openMenu();
    expect(screen.getByText("Volle Auflösung (langsam)…")).toBeTruthy();
    expect(screen.getByText("Bildschirmfoto des Oszilloskops")).toBeTruthy();
  });

  it("opens the full-resolution dialog from the menu", () => {
    renderButton();
    openMenu();
    fireEvent.click(screen.getByText("Volle Auflösung (langsam)…"));
    expect(screen.getByText("Volle Auflösung lesen")).toBeTruthy();
  });

  it("opens exactly one dialog whether the menu or another opener asks for it", () => {
    function ShortcutOpener() {
      return <button onClick={useFullResolutionDialog().open}>F-Kürzel</button>;
    }
    render(
      <FullResolutionProvider deviceId="scope-01">
        <CaptureButton deviceId="scope-01" layout="column" />
        <ShortcutOpener />
      </FullResolutionProvider>,
    );
    expect(screen.queryAllByRole("dialog")).toHaveLength(0);
    fireEvent.click(screen.getByText("F-Kürzel"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    cleanup();
    renderButton();
    openMenu();
    fireEvent.click(screen.getByText("Volle Auflösung (langsam)…"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("attaches a secondary menu toggle under the save button in the rail", () => {
    renderButton("rail");
    const trigger = screen.getByRole("button", { name: "Weitere Aufnahmearten" });
    expect(trigger.className).not.toContain("bg-(--lab-accent)");
    expect(screen.getByTestId("capture-save").className).toContain("rounded-b-none");
  });

  it("saves a screenshot once and shows the thumbnail toast", async () => {
    h.fake.actions.saveScreenshot.mockResolvedValue({ artifactId: "art-9" });
    renderButton();
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
    renderButton();
    openMenu();
    expect(screen.queryByText("Bildschirmfoto des Oszilloskops")).toBeNull();
  });
});
