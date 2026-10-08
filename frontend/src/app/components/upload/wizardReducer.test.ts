import { describe, expect, it } from "vitest";
import type { CommitResponse } from "../../../api/types";
import { EMPTY_SELECTION } from "../OpenBISObjectSelector";
import { DEFAULT_PINNED } from "./rememberedMetadata";
import type { WizardState } from "./types";
import {
  buildCommitRequest,
  firstInvalidStep,
  initialWizardState,
  stepIssue,
  targetIdentifiers,
  wizardReducer,
  type WizardAction,
} from "./wizardReducer";

const PREFS = { pinned: { ...DEFAULT_PINNED }, meta: {} };

const SELECTION = {
  ...EMPTY_SELECTION,
  projectCode: "P1",
  projectLabel: "Mittwoch – Gruppe 4",
  groupName: "Gruppe 4",
  semester: "WS26",
  collectionCode: "E1",
  collectionLabel: "RC-Glied",
  collectionIdentifier: "/LAB/P1/E1",
};

function run(state: WizardState, ...actions: WizardAction[]): WizardState {
  return actions.reduce(wizardReducer, state);
}

function filled(): WizardState {
  return run(
    initialWizardState(["c1", "c2"], PREFS),
    { type: "setSelection", selection: SELECTION },
    { type: "setMeta", field: "labCourse", value: "GP1" },
    { type: "setMeta", field: "expTitle", value: "RC-Glied" },
  );
}

describe("navigation and validation", () => {
  it("starts on step 1 with all captures ticked", () => {
    const s = initialWizardState(["a", "b"], PREFS);
    expect(s.step).toBe("review");
    expect(s.includedIds).toEqual(["a", "b"]);
  });

  it("blocks Weiter on step 1 when everything is unticked, with a reason", () => {
    let s = initialWizardState(["a"], PREFS);
    s = run(s, { type: "toggleCapture", id: "a" });
    expect(stepIssue(s, "review")).toMatch(/Aufnahme/);
    expect(run(s, { type: "next" }).step).toBe("review");
    s = run(s, { type: "toggleCapture", id: "a" });
    expect(run(s, { type: "next" }).step).toBe("target");
  });

  it("requires group and experiment in list mode", () => {
    let s = run(initialWizardState(["a"], PREFS), { type: "next" });
    expect(stepIssue(s, "target")).toMatch(/Gruppe/);
    s = run(s, { type: "setSelection", selection: { ...SELECTION, collectionCode: "", collectionIdentifier: "" } });
    expect(stepIssue(s, "target")).toMatch(/Versuch/);
    s = run(s, { type: "setSelection", selection: SELECTION });
    expect(stepIssue(s, "target")).toBeNull();
  });

  it("validates manually entered identifiers", () => {
    let s = run(initialWizardState(["a"], PREFS), { type: "setTargetMode", mode: "manual" });
    expect(stepIssue(s, "target")).not.toBeNull();
    s = run(s, { type: "setManual", field: "manualExperimentId", value: "/LAB/P1/E1" });
    expect(stepIssue(s, "target")).toBeNull();
    s = run(s, { type: "setManual", field: "manualObjectId", value: "kein-pfad" });
    expect(stepIssue(s, "target")).not.toBeNull();
    s = run(s, { type: "setManual", field: "manualObjectId", value: "/LAB/OBJ1" });
    expect(stepIssue(s, "target")).toBeNull();
    expect(targetIdentifiers(s)).toEqual({ experimentId: "/LAB/P1/E1", objectId: "/LAB/OBJ1" });
  });

  it("requires Praktikum and Versuchstitel on step 3", () => {
    let s = filled();
    expect(firstInvalidStep(s)).toBeNull();
    s = run(s, { type: "setMeta", field: "expTitle", value: "  " });
    expect(stepIssue(s, "details")).toMatch(/Versuchstitel/);
    s = run(s, { type: "setMeta", field: "labCourse", value: "" });
    expect(stepIssue(s, "details")).toMatch(/Praktikum/);
  });

  it("walks forward and back, but never skips an invalid step via goto", () => {
    const s = initialWizardState(["a"], PREFS);
    // step 2 is still incomplete, so jumping to the summary is refused
    expect(run(s, { type: "goto", step: "confirm" }).step).toBe("review");
    expect(run(s, { type: "goto", step: "target" }).step).toBe("target");
    const ok = filled();
    expect(run(ok, { type: "next" }, { type: "next" }, { type: "next" }).step).toBe("confirm");
    expect(run(ok, { type: "goto", step: "confirm" }).step).toBe("confirm");
    expect(run(ok, { type: "goto", step: "details" }, { type: "back" }).step).toBe("target");
  });

  it("does not enter the result step by next", () => {
    const s = run(filled(), { type: "goto", step: "confirm" }, { type: "next" });
    expect(s.step).toBe("confirm");
  });
});

describe("submit lifecycle", () => {
  const result: CommitResponse = { permId: "2026-1", artifact_count: 4, artifact_ids: ["x"], openbis_url: "https://x" };

  it("moves to result/submitting, then success; re-submit after success is impossible (A14)", () => {
    let s = run(filled(), { type: "submitStart" });
    expect(s.step).toBe("result");
    expect(s.submit.status).toBe("submitting");
    expect(run(s, { type: "submitStart" })).toBe(s);
    s = run(s, { type: "submitSuccess", result, count: 2 });
    expect(s.submit).toEqual({ status: "success", result, count: 2 });
    expect(run(s, { type: "submitStart" })).toBe(s);
  });

  it("allows a retry after an error and can go back to the summary", () => {
    let s = run(filled(), { type: "submitStart" }, { type: "submitError", message: "boom" });
    expect(s.submit).toEqual({ status: "error", message: "boom" });
    expect(run(s, { type: "goto", step: "confirm" }).step).toBe("confirm");
    s = run(s, { type: "submitStart" });
    expect(s.submit.status).toBe("submitting");
  });

  it("ignores submitStart when the form is incomplete", () => {
    const s = initialWizardState(["a"], PREFS);
    expect(run(s, { type: "submitStart" })).toBe(s);
  });

  it("does not navigate away while uploading", () => {
    const s = run(filled(), { type: "submitStart" });
    expect(run(s, { type: "back" })).toBe(s);
    expect(run(s, { type: "goto", step: "review" })).toBe(s);
  });
});

describe("buildCommitRequest", () => {
  it("sends the unticked-aware artifact ids, trimmed metadata and group/semester", () => {
    const s = run(
      filled(),
      { type: "setMeta", field: "expTitle", value: "  RC-Glied  " },
      { type: "setMeta", field: "notes", value: "" },
      { type: "setSelection", selection: { ...SELECTION, objectIdentifier: "/LAB/OBJ1" } },
    );
    expect(buildCommitRequest(s, ["a1", "a2"])).toEqual({
      experiment_id: "/LAB/P1/E1",
      object_id: "/LAB/OBJ1",
      artifact_ids: ["a1", "a2"],
      lab_course: "GP1",
      exp_title: "RC-Glied",
      group_name: "Gruppe 4",
      semester: "WS26",
      exp_description: undefined,
      device_under_test: undefined,
      notes: undefined,
    });
  });

  it("uses the manual identifiers and no group in manual mode", () => {
    const s = run(
      filled(),
      { type: "setTargetMode", mode: "manual" },
      { type: "setManual", field: "manualExperimentId", value: " /LAB/P9/E9 " },
    );
    const body = buildCommitRequest(s, ["a"]);
    expect(body.experiment_id).toBe("/LAB/P9/E9");
    expect(body.object_id).toBeUndefined();
    expect(body.group_name).toBeUndefined();
  });
});

describe("pins", () => {
  it("toggles a pin and applies remembered values at start", () => {
    const s = initialWizardState(["a"], {
      pinned: { ...DEFAULT_PINNED, notes: true },
      meta: { labCourse: "GP2", notes: "alt" },
      target: { projectCode: "P1", collectionCode: "E1", objectIdentifier: "" },
    });
    expect(s.meta.labCourse).toBe("GP2");
    expect(s.meta.notes).toBe("alt");
    expect(s.target.selection.projectCode).toBe("P1");
    expect(run(s, { type: "togglePin", key: "notes" }).pinned.notes).toBe(false);
  });
});
