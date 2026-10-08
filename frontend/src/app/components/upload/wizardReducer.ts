/**
 * State machine of the upload wizard: reducer, per-step validation and the
 * commit request builder. Pure — unit-tested in wizardReducer.test.ts.
 */
import type { CommitResponse } from "../../../api/types";
import type { CommitRequest } from "../../../api/sessions";
import { de } from "../../../i18n/de";
import { EMPTY_SELECTION, type ObjectSelection } from "../OpenBISObjectSelector";
import {
  DEFAULT_PINNED,
  EMPTY_META,
  selectionFromRemembered,
  type RememberedPrefs,
} from "./rememberedMetadata";
import {
  STEP_ORDER,
  type MetaField,
  type RememberKey,
  type WizardState,
  type WizardStep,
} from "./types";

const t = de.archive.wizard;

export type WizardAction =
  | { type: "toggleCapture"; id: string }
  | { type: "setSelection"; selection: ObjectSelection }
  | { type: "setTargetMode"; mode: "list" | "manual" }
  | { type: "setManual"; field: "manualExperimentId" | "manualObjectId"; value: string }
  | { type: "setMeta"; field: MetaField; value: string }
  | { type: "togglePin"; key: RememberKey }
  | { type: "next" }
  | { type: "back" }
  | { type: "goto"; step: WizardStep }
  | { type: "submitStart" }
  | { type: "submitSuccess"; result: CommitResponse; count: number }
  | { type: "submitError"; message: string };

/** `/SPACE/PROJECT/EXPERIMENT` — the openBIS collection identifier. */
export const EXPERIMENT_ID_PATTERN = /^\/[^/\s]+\/[^/\s]+\/[^/\s]+$/;
/** `/SPACE/OBJECT` or `/SPACE/PROJECT/OBJECT`. */
export const OBJECT_ID_PATTERN = /^\/[^/\s]+(\/[^/\s]+){1,2}$/;

/**
 * Creates the initial state when the wizard opens.
 * @param captureIds - Ids of the captures selected for upload
 * @param prefs - Remembered form values of this user
 * @returns State on step ① with remembered values applied
 */
export function initialWizardState(captureIds: string[], prefs: RememberedPrefs): WizardState {
  return {
    step: "review",
    includedIds: [...captureIds],
    target: {
      mode: "list",
      selection: selectionFromRemembered(prefs.target),
      manualExperimentId: "",
      manualObjectId: "",
    },
    meta: { ...EMPTY_META, ...prefs.meta },
    pinned: { ...DEFAULT_PINNED, ...prefs.pinned },
    submit: { status: "idle" },
  };
}

/**
 * Identifier of the upload target as sent to the backend.
 * @param state - Wizard state
 * @returns Collection identifier and optional object identifier (trimmed, "" when unset)
 */
export function targetIdentifiers(state: WizardState): { experimentId: string; objectId: string } {
  const { mode, selection, manualExperimentId, manualObjectId } = state.target;
  return mode === "manual"
    ? { experimentId: manualExperimentId.trim(), objectId: manualObjectId.trim() }
    : { experimentId: selection.collectionIdentifier, objectId: selection.objectIdentifier };
}

/**
 * Explains why a step cannot be left yet (German sentence), or null when it is complete.
 * Shown as the reason next to the disabled "Weiter" button.
 * @param state - Wizard state
 * @param step - Step to validate
 * @returns The reason, or null when valid
 */
export function stepIssue(state: WizardState, step: WizardStep): string | null {
  switch (step) {
    case "review":
      return state.includedIds.length === 0 ? t.review.reasonNone : null;
    case "target": {
      const { mode, selection, manualExperimentId, manualObjectId } = state.target;
      if (mode === "manual") {
        if (!EXPERIMENT_ID_PATTERN.test(manualExperimentId.trim())) return t.target.manualInvalid;
        if (manualObjectId.trim() && !OBJECT_ID_PATTERN.test(manualObjectId.trim()))
          return t.target.manualObjectInvalid;
        return null;
      }
      if (!selection.projectCode) return t.target.reasonGroup;
      if (!selection.collectionIdentifier) return t.target.reasonExperiment;
      return null;
    }
    case "details":
      if (!state.meta.labCourse) return t.details.reasonCourse;
      if (!state.meta.expTitle.trim()) return t.details.reasonTitle;
      return null;
    default:
      return null;
  }
}

/**
 * First incomplete step among ①–③, used to guard jumps forward.
 * @param state - Wizard state
 * @returns The step to fix, or null when everything is complete
 */
export function firstInvalidStep(state: WizardState): WizardStep | null {
  for (const step of ["review", "target", "details"] as const) {
    if (stepIssue(state, step)) return step;
  }
  return null;
}

/**
 * Builds the `POST /sessions/{id}/commit` body from the wizard state.
 * @param state - Wizard state (must be valid)
 * @param artifactIds - Artifact ids of the ticked captures
 * @returns The request body; empty optional fields are omitted
 */
export function buildCommitRequest(state: WizardState, artifactIds: string[]): CommitRequest {
  const { experimentId, objectId } = targetIdentifiers(state);
  const sel = state.target.mode === "list" ? state.target.selection : EMPTY_SELECTION;
  const opt = (v: string) => v.trim() || undefined;
  return {
    experiment_id: experimentId,
    object_id: opt(objectId),
    artifact_ids: artifactIds,
    lab_course: opt(state.meta.labCourse),
    exp_title: opt(state.meta.expTitle),
    group_name: opt(sel.groupName),
    semester: opt(sel.semester),
    exp_description: opt(state.meta.expDescription),
    device_under_test: opt(state.meta.deviceUnderTest),
    notes: opt(state.meta.notes),
  };
}

function move(state: WizardState, delta: 1 | -1): WizardState {
  const i = STEP_ORDER.indexOf(state.step);
  const target = STEP_ORDER[i + delta];
  // "confirm" → "result" only happens through submitStart.
  if (!target || target === "result") return state;
  if (delta === 1 && stepIssue(state, state.step)) return state;
  return { ...state, step: target };
}

/**
 * Reducer of the upload wizard.
 * @param state - Current state
 * @param action - Action to apply
 * @returns The next state; invalid navigation returns the same state
 */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "toggleCapture": {
      const included = state.includedIds.includes(action.id);
      return {
        ...state,
        includedIds: included
          ? state.includedIds.filter((id) => id !== action.id)
          : [...state.includedIds, action.id],
      };
    }
    case "setSelection":
      return { ...state, target: { ...state.target, selection: action.selection } };
    case "setTargetMode":
      return { ...state, target: { ...state.target, mode: action.mode } };
    case "setManual":
      return { ...state, target: { ...state.target, [action.field]: action.value } };
    case "setMeta":
      return { ...state, meta: { ...state.meta, [action.field]: action.value } };
    case "togglePin":
      return { ...state, pinned: { ...state.pinned, [action.key]: !state.pinned[action.key] } };
    case "next":
      return move(state, 1);
    case "back":
      return state.submit.status === "submitting" ? state : move(state, -1);
    case "goto": {
      if (state.submit.status === "submitting" || action.step === "result") return state;
      const from = STEP_ORDER.indexOf(state.step);
      const to = STEP_ORDER.indexOf(action.step);
      if (to <= from) return { ...state, step: action.step };
      const blocked = firstInvalidStep(state);
      if (blocked && STEP_ORDER.indexOf(blocked) < to) return state;
      return { ...state, step: action.step };
    }
    case "submitStart":
      if (state.submit.status === "submitting" || state.submit.status === "success") return state;
      if (firstInvalidStep(state)) return state;
      return { ...state, step: "result", submit: { status: "submitting" } };
    case "submitSuccess":
      return {
        ...state,
        step: "result",
        submit: { status: "success", result: action.result, count: action.count },
      };
    case "submitError":
      return { ...state, step: "result", submit: { status: "error", message: action.message } };
  }
}
