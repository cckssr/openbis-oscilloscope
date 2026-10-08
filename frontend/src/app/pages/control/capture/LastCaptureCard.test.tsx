import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LastCaptureCard } from "./LastCaptureCard";
import { FakeSession, heldState, makeCapture } from "../actions/testing";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeSession }));
vi.mock("../actions/session", (orig) =>
  import("../actions/testing").then((m) => m.sessionMock(orig, () => h.fake)),
);

beforeEach(() => {
  h.fake = new FakeSession(heldState({ lastCapture: makeCapture() }));
});
afterEach(cleanup);

const note = () => screen.getByLabelText("Notiz") as HTMLTextAreaElement;

describe("LastCaptureCard", () => {
  it("shows an empty state before the first capture", () => {
    h.fake = new FakeSession(heldState());
    render(<LastCaptureCard deviceId="scope-01" />);
    expect(screen.getByText("Noch keine Aufnahme gespeichert.")).toBeTruthy();
  });

  it("summarises number, time, channels and the full-resolution badge", () => {
    h.fake = new FakeSession(heldState({ lastCapture: makeCapture({ fullResolution: true }) }));
    render(<LastCaptureCard deviceId="scope-01" />);
    expect(screen.getByTestId("capture-summary").textContent).toMatch(/^Aufnahme #5 · 14:02:11$/);
    expect(screen.getByText("CH1")).toBeTruthy();
    expect(screen.getByText("CH2")).toBeTruthy();
    expect(screen.getByText("Volle Auflösung")).toBeTruthy();
  });

  it("keeps the typed draft across live frame updates", () => {
    render(<LastCaptureCard deviceId="scope-01" />);
    fireEvent.change(note(), { target: { value: "Resonanz bei 1 kHz" } });
    for (let i = 0; i < 3; i++) {
      act(() =>
        h.fake.set({
          frame: { ...makeCapture().frame, source: "live", receivedAt: i },
          live: { status: "on", lastFrameAt: i },
        }),
      );
    }
    expect(note().value).toBe("Resonanz bei 1 kHz");
  });

  it("saves the note on Enter and shows the saved state", async () => {
    render(<LastCaptureCard deviceId="scope-01" />);
    fireEvent.change(note(), { target: { value: "Test" } });
    h.fake.actions.saveNote.mockImplementation(async (text: string) => {
      act(() => h.fake.set({ lastCapture: makeCapture({ note: text }) }));
    });
    await act(async () => {
      fireEvent.keyDown(note(), { key: "Enter" });
    });
    expect(h.fake.actions.saveNote).toHaveBeenCalledWith("Test");
    expect(screen.getByTestId("note-status").textContent).toBe("Notiz gespeichert");
  });

  it("warns when the note could not be saved", async () => {
    render(<LastCaptureCard deviceId="scope-01" />);
    fireEvent.change(note(), { target: { value: "Test" } });
    await act(async () => {
      fireEvent.blur(note());
    });
    expect(screen.getByTestId("note-status").textContent).toBe("Notiz nicht gespeichert");
  });

  it("does not save an unchanged note and uses Umschalt+Enter for new lines", async () => {
    render(<LastCaptureCard deviceId="scope-01" />);
    await act(async () => {
      fireEvent.blur(note());
      fireEvent.keyDown(note(), { key: "Enter", shiftKey: true });
    });
    expect(h.fake.actions.saveNote).not.toHaveBeenCalled();
  });

  it("starts with the new capture's own note when a new capture arrives", () => {
    render(<LastCaptureCard deviceId="scope-01" />);
    fireEvent.change(note(), { target: { value: "alt" } });
    act(() => h.fake.set({ lastCapture: makeCapture({ acquisitionId: "acq-2", number: 6 }) }));
    expect(note().value).toBe("");
  });

  it("selects the capture for upload", () => {
    render(<LastCaptureCard deviceId="scope-01" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Zum Hochladen auswählen" }));
    expect(h.fake.actions.setCaptureFlag).toHaveBeenCalledWith(true);
  });

  it("is read-only while the device is not controlled", () => {
    h.fake = new FakeSession(heldState({ lock: { status: "none" }, lastCapture: makeCapture() }));
    render(<LastCaptureCard deviceId="scope-01" />);
    expect(note().readOnly).toBe(true);
    expect(screen.getByRole("checkbox").hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Notiz speichern" })).toBeNull();
  });

  it("exposes the note field id for the N shortcut", () => {
    render(<LastCaptureCard deviceId="scope-01" layout="compact" />);
    expect(note().id).toBe("capture-note-input");
  });
});
