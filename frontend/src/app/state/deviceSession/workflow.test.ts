import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "./initialState";
import { makeDevice } from "./testing";
import { selectWorkflow } from "./workflow";
import type { DeviceSessionState } from "./types";

vi.mock("../../../api/devices");

function state(patch: Partial<DeviceSessionState> = {}): DeviceSessionState {
  return { ...createInitialState("scope-01"), ...patch };
}

const counts = (c: Partial<DeviceSessionState["counts"]>) => ({
  total: 0,
  withNoteOrFlag: 0,
  flagged: 0,
  uploaded: 0,
  notUploaded: 0,
  ...c,
});

const held = { status: "held", sessionId: "s" } as const;
const states = (s: DeviceSessionState) => s && selectWorkflow(s).steps.map((x) => x.state);

describe("selectWorkflow", () => {
  it("has the five German steps with the optional setup step", () => {
    const { steps } = selectWorkflow(state());
    expect(steps.map((s) => s.label)).toEqual([
      "Gerät übernehmen",
      "Signal einstellen",
      "Aufnehmen",
      "Notieren & auswählen",
      "Hochladen",
    ]);
    expect(steps.map((s) => s.id)).toEqual(["take", "setup", "capture", "annotate", "upload"]);
    expect(steps.filter((s) => s.optional).map((s) => s.id)).toEqual(["setup"]);
  });

  it("before taking the device: take is active, the rest blocked", () => {
    const w = selectWorkflow(state());
    expect(w.steps.map((s) => s.state)).toEqual(["active", "blocked", "blocked", "blocked", "blocked"]);
    expect(w.next).toBe("Drücke „Gerät übernehmen“, um zu beginnen.");
  });

  it("an offline device blocks step 1", () => {
    const w = selectWorkflow(state({ device: makeDevice({ state: "OFFLINE" }) }));
    expect(w.steps[0].state).toBe("blocked");
  });

  it("after taking control: setup is active and the hint points at Live", () => {
    const w = selectWorkflow(state({ lock: held }));
    expect(states(state({ lock: held }))).toEqual(["done", "active", "todo", "todo", "blocked"]);
    expect(w.next).toBe("Drücke „Live starten“, um das Signal zu sehen.");
  });

  it("once a frame is visible the hint asks for a capture", () => {
    const frame = { source: "live" } as DeviceSessionState["frame"];
    const w = selectWorkflow(state({ lock: held, frame }));
    expect(w.next).toBe("Speichere eine Aufnahme mit „Aufnahme speichern“.");
  });

  it("an applied setting finishes step 2 and activates the capture", () => {
    const s = state({ lock: held, settings: { ...state().settings, touched: true } });
    expect(states(s).slice(0, 3)).toEqual(["done", "done", "active"]);
  });

  it("a capture without note asks for a note", () => {
    const s = state({ lock: held, counts: counts({ total: 1, notUploaded: 1 }) });
    expect(states(s)).toEqual(["done", "todo", "done", "active", "todo"]);
    expect(selectWorkflow(s).next).toBe(
      "Schreibe eine Notiz zur Aufnahme und wähle sie zum Hochladen aus.",
    );
  });

  it("flagged captures activate the upload step", () => {
    const s = state({
      lock: held,
      counts: counts({ total: 2, withNoteOrFlag: 1, flagged: 1, notUploaded: 2 }),
    });
    const w = selectWorkflow(s);
    expect(w.steps[3].state).toBe("done");
    expect(w.steps[4].state).toBe("active");
    expect(w.next).toBe("Lade deine ausgewählten Aufnahmen im Archiv hoch.");
  });

  it("everything uploaded finishes the strip", () => {
    const s = state({
      lock: held,
      settings: { ...state().settings, touched: true },
      counts: counts({ total: 2, withNoteOrFlag: 2, uploaded: 2 }),
    });
    expect(states(s)).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("keeps showing data steps after the device was released", () => {
    const s = state({
      lock: { status: "none", previousSessionId: "s" },
      counts: counts({ total: 1, withNoteOrFlag: 1, flagged: 1, notUploaded: 1 }),
    });
    const w = selectWorkflow(s);
    expect(w.steps[0].state).toBe("active");
    expect(w.steps[4].state).toBe("active");
    expect(w.next).toBe("Lade deine ausgewählten Aufnahmen im Archiv hoch.");
  });

  it("passive and lost tabs explain what to do", () => {
    expect(selectWorkflow(state({ lock: { status: "passive", sessionId: "s" } })).next).toMatch(/anderen Tab/);
    expect(selectWorkflow(state({ lock: { status: "lost", sessionId: "s" } })).next).toMatch(/erneut/);
  });
});
