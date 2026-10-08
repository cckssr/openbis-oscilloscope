/**
 * Per-user memory of the upload form ("merken"). Pinned fields are stored in
 * localStorage and pre-filled next time; unpinned fields are dropped.
 * All storage access is guarded — private mode or blocked storage must never
 * break the wizard.
 */
import {
  EMPTY_SELECTION,
  type ObjectSelection,
} from "../OpenBISObjectSelector";
import {
  REMEMBER_KEYS,
  type MetaField,
  type MetaState,
  type RememberKey,
  type WizardState,
} from "./types";

/** Minimal storage surface, so tests can inject a fake. */
export type PrefsStorage = Pick<Storage, "getItem" | "setItem">;

/** The remembered target: only codes/identifiers, labels are resolved from openBIS again. */
export interface RememberedTarget {
  projectCode: string;
  collectionCode: string;
  objectIdentifier: string;
}

export interface RememberedPrefs {
  pinned: Record<RememberKey, boolean>;
  meta: Partial<MetaState>;
  target?: RememberedTarget;
}

/** Praktikum, title and description rarely change between uploads; measurement object and notes do. */
export const DEFAULT_PINNED: Record<RememberKey, boolean> = {
  target: true,
  labCourse: true,
  expTitle: true,
  expDescription: true,
  deviceUnderTest: false,
  notes: false,
};

export const EMPTY_META: MetaState = {
  labCourse: "",
  expTitle: "",
  expDescription: "",
  deviceUnderTest: "",
  notes: "",
};

const META_FIELDS = Object.keys(EMPTY_META) as MetaField[];

/**
 * localStorage key of a user's prefs.
 * @param userId - openBIS user id
 * @returns The storage key
 */
export function prefsKey(userId: string): string {
  return `osc_upload_prefs:${userId}`;
}

function defaultStorage(): PrefsStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads the remembered prefs of a user. Never throws: unreadable or malformed
 * data yields the defaults.
 * @param userId - openBIS user id
 * @param storage - Storage to read from (defaults to localStorage)
 * @returns The prefs; unpinned fields have no stored value
 */
export function loadPrefs(
  userId: string,
  storage: PrefsStorage | null = defaultStorage(),
): RememberedPrefs {
  const fallback: RememberedPrefs = { pinned: { ...DEFAULT_PINNED }, meta: {} };
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(prefsKey(userId));
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<RememberedPrefs> | null;
    if (!data || typeof data !== "object") return fallback;
    const pinned = { ...DEFAULT_PINNED };
    for (const key of REMEMBER_KEYS) {
      if (typeof data.pinned?.[key] === "boolean")
        pinned[key] = data.pinned[key];
    }
    const meta: Partial<MetaState> = {};
    for (const field of META_FIELDS) {
      const value = data.meta?.[field];
      if (pinned[field] && typeof value === "string") meta[field] = value;
    }
    const t = data.target;
    const target =
      pinned.target &&
      t &&
      typeof t.projectCode === "string" &&
      typeof t.collectionCode === "string"
        ? {
            projectCode: t.projectCode,
            collectionCode: t.collectionCode,
            objectIdentifier:
              typeof t.objectIdentifier === "string" ? t.objectIdentifier : "",
          }
        : undefined;
    return { pinned, meta, target };
  } catch {
    return fallback;
  }
}

/**
 * Builds the prefs to store from the wizard state: pinned fields keep their
 * value, unpinned ones are dropped.
 * @param state - Wizard state at submit time
 * @returns The prefs to persist
 */
export function prefsFromState(state: WizardState): RememberedPrefs {
  const meta: Partial<MetaState> = {};
  for (const field of META_FIELDS) {
    if (state.pinned[field]) meta[field] = state.meta[field];
  }
  const sel = state.target.selection;
  const target =
    state.pinned.target && state.target.mode === "list" && sel.collectionCode
      ? {
          projectCode: sel.projectCode,
          collectionCode: sel.collectionCode,
          objectIdentifier: sel.objectIdentifier,
        }
      : undefined;
  return { pinned: { ...state.pinned }, meta, target };
}

/**
 * Persists the prefs. Failures (quota, private mode) are ignored.
 * @param userId - openBIS user id
 * @param prefs - What to store
 * @param storage - Storage to write to (defaults to localStorage)
 * @returns true when the data was written
 */
export function savePrefs(
  userId: string,
  prefs: RememberedPrefs,
  storage: PrefsStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(prefsKey(userId), JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/**
 * Turns the remembered target into a (still unresolved) selector value: codes
 * only, the selector fills in labels and identifiers once the lists loaded.
 * @param target - Remembered target, if any
 * @returns A selection to start the wizard with
 */
export function selectionFromRemembered(
  target: RememberedTarget | undefined,
): ObjectSelection {
  if (!target) return EMPTY_SELECTION;
  return {
    ...EMPTY_SELECTION,
    projectCode: target.projectCode,
    collectionCode: target.collectionCode,
    objectIdentifier: target.objectIdentifier,
  };
}
