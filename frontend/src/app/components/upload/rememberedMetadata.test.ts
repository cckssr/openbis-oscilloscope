import { describe, expect, it } from "vitest";
import { EMPTY_SELECTION } from "../OpenBISObjectSelector";
import {
  DEFAULT_PINNED,
  loadPrefs,
  prefsFromState,
  prefsKey,
  savePrefs,
  selectionFromRemembered,
  type PrefsStorage,
} from "./rememberedMetadata";
import { initialWizardState, wizardReducer } from "./wizardReducer";

function memoryStorage(initial: Record<string, string> = {}): PrefsStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const throwing: PrefsStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
};

describe("loadPrefs", () => {
  it("returns defaults for a new user, no storage, broken storage and malformed JSON", () => {
    expect(loadPrefs("u", memoryStorage()).pinned).toEqual(DEFAULT_PINNED);
    expect(loadPrefs("u", null).meta).toEqual({});
    expect(loadPrefs("u", throwing).meta).toEqual({});
    expect(loadPrefs("u", memoryStorage({ [prefsKey("u")]: "{nope" })).meta).toEqual({});
    expect(loadPrefs("u", memoryStorage({ [prefsKey("u")]: "42" })).pinned).toEqual(DEFAULT_PINNED);
  });

  it("is separate per user", () => {
    const st = memoryStorage();
    const state = wizardReducer(initialWizardState([], loadPrefs("anna", st)), {
      type: "setMeta",
      field: "expTitle",
      value: "RC",
    });
    savePrefs("anna", prefsFromState(state), st);
    expect(loadPrefs("anna", st).meta.expTitle).toBe("RC");
    expect(loadPrefs("ben", st).meta.expTitle).toBeUndefined();
  });
});

describe("pinned vs unpinned", () => {
  it("keeps pinned fields, drops unpinned ones", () => {
    const st = memoryStorage();
    let state = initialWizardState(["a"], loadPrefs("u", st));
    for (const [field, value] of [
      ["labCourse", "GP1"],
      ["expTitle", "Titel"],
      ["deviceUnderTest", "Filter"],
      ["notes", "Notiz"],
    ] as const) {
      state = wizardReducer(state, { type: "setMeta", field, value });
    }
    // defaults: Messobjekt and Notizen are not pinned; pin the notes explicitly
    state = wizardReducer(state, { type: "togglePin", key: "notes" });
    expect(savePrefs("u", prefsFromState(state), st)).toBe(true);

    const next = initialWizardState(["b"], loadPrefs("u", st));
    expect(next.meta).toMatchObject({ labCourse: "GP1", expTitle: "Titel", notes: "Notiz", deviceUnderTest: "" });
    expect(next.pinned.notes).toBe(true);
  });

  it("clears a field once it is unpinned", () => {
    const st = memoryStorage();
    let state = initialWizardState(["a"], loadPrefs("u", st));
    state = wizardReducer(state, { type: "setMeta", field: "expTitle", value: "Titel" });
    state = wizardReducer(state, { type: "togglePin", key: "expTitle" });
    savePrefs("u", prefsFromState(state), st);
    const next = initialWizardState(["b"], loadPrefs("u", st));
    expect(next.meta.expTitle).toBe("");
    expect(next.pinned.expTitle).toBe(false);
  });

  it("remembers the list target (codes only) when pinned, and drops it otherwise", () => {
    const selection = {
      ...EMPTY_SELECTION,
      projectCode: "P1",
      projectLabel: "G4",
      collectionCode: "E1",
      collectionIdentifier: "/L/P1/E1",
      objectIdentifier: "/L/O1",
    };
    let state = wizardReducer(initialWizardState(["a"], loadPrefs("u", memoryStorage())), {
      type: "setSelection",
      selection,
    });
    expect(prefsFromState(state).target).toEqual({
      projectCode: "P1",
      collectionCode: "E1",
      objectIdentifier: "/L/O1",
    });
    const st = memoryStorage();
    savePrefs("u", prefsFromState(state), st);
    expect(selectionFromRemembered(loadPrefs("u", st).target)).toMatchObject({
      projectCode: "P1",
      collectionCode: "E1",
      objectIdentifier: "/L/O1",
      collectionIdentifier: "",
    });

    state = wizardReducer(state, { type: "togglePin", key: "target" });
    expect(prefsFromState(state).target).toBeUndefined();
  });
});

describe("savePrefs", () => {
  it("never throws when storage is unavailable", () => {
    expect(savePrefs("u", { pinned: { ...DEFAULT_PINNED }, meta: {} }, throwing)).toBe(false);
    expect(savePrefs("u", { pinned: { ...DEFAULT_PINNED }, meta: {} }, null)).toBe(false);
  });
});
