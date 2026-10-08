import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useControlShortcuts } from "./useControlShortcuts";
import { FakeSession, heldState } from "./testing";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeSession }));
vi.mock("./session", (orig) =>
  import("./testing").then((m) => m.sessionMock(orig, () => h.fake)),
);

function Harness({
  onOpenFullResolution,
}: {
  onOpenFullResolution?: () => void;
}) {
  useControlShortcuts("scope-01", { onOpenFullResolution });
  return (
    <div>
      <textarea data-testid="typing" />
      <select data-testid="select" />
      <button data-testid="button">x</button>
      <textarea id="capture-note-input" data-testid="note" />
    </div>
  );
}

beforeEach(() => {
  h.fake = new FakeSession(heldState());
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("useControlShortcuts", () => {
  it("Space toggles live", () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(h.fake.actions.startLive).toHaveBeenCalledTimes(1);
  });

  it("Space stops live when it runs", () => {
    h.fake = new FakeSession(heldState({ live: { status: "on" } }));
    render(<Harness />);
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(h.fake.actions.stopLive).toHaveBeenCalledTimes(1);
    expect(h.fake.actions.startLive).not.toHaveBeenCalled();
  });

  it("S saves a capture", () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: "s" });
    expect(h.fake.actions.saveCapture).toHaveBeenCalledTimes(1);
  });

  it("N focuses the note field", () => {
    const { getByTestId } = render(<Harness />);
    fireEvent.keyDown(window, { key: "n" });
    expect(document.activeElement).toBe(getByTestId("note"));
  });

  it("ignores keys while typing in inputs, textareas and selects", () => {
    const { getByTestId } = render(<Harness />);
    for (const id of ["typing", "select", "note"]) {
      fireEvent.keyDown(getByTestId(id), { key: "s", bubbles: true });
      fireEvent.keyDown(getByTestId(id), {
        key: " ",
        code: "Space",
        bubbles: true,
      });
    }
    expect(h.fake.actions.saveCapture).not.toHaveBeenCalled();
    expect(h.fake.actions.startLive).not.toHaveBeenCalled();
  });

  it("leaves Space to a focused button", () => {
    const { getByTestId } = render(<Harness />);
    fireEvent.keyDown(getByTestId("button"), { key: " ", code: "Space" });
    expect(h.fake.actions.startLive).not.toHaveBeenCalled();
  });

  it("ignores keys while a dialog is open", () => {
    render(<Harness />);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    fireEvent.keyDown(window, { key: "s" });
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(h.fake.actions.saveCapture).not.toHaveBeenCalled();
    expect(h.fake.actions.startLive).not.toHaveBeenCalled();
  });

  it("does nothing unless this tab controls the device", () => {
    h.fake = new FakeSession(heldState({ lock: { status: "none" } }));
    render(<Harness />);
    fireEvent.keyDown(window, { key: "s" });
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    fireEvent.keyDown(window, { key: "n" });
    expect(h.fake.actions.saveCapture).not.toHaveBeenCalled();
    expect(h.fake.actions.startLive).not.toHaveBeenCalled();
  });

  it("respects the disabled reasons of the buttons and modifier keys", () => {
    h.fake = new FakeSession(heldState({ busy: "Gerät wird gestartet…" }));
    render(<Harness />);
    fireEvent.keyDown(window, { key: "s" });
    expect(h.fake.actions.saveCapture).not.toHaveBeenCalled();
    h.fake = new FakeSession(heldState());
  });

  it("F opens the full-resolution dialog only when a handler is given", () => {
    const open = vi.fn();
    const { unmount } = render(<Harness onOpenFullResolution={open} />);
    fireEvent.keyDown(window, { key: "f" });
    expect(open).toHaveBeenCalledTimes(1);
    unmount();
    render(<Harness />);
    fireEvent.keyDown(window, { key: "f" });
    expect(open).toHaveBeenCalledTimes(1);
  });
});
