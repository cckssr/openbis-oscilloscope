/** Shared types of the upload wizard. */
import type { CommitResponse } from "../../../api/types";
import type { ObjectSelection } from "../OpenBISObjectSelector";

export type WizardStep = "review" | "target" | "details" | "confirm" | "result";

/** Order of the steps; "result" is the outcome screen after "Jetzt hochladen". */
export const STEP_ORDER: readonly WizardStep[] = [
  "review",
  "target",
  "details",
  "confirm",
  "result",
];

/** Free-text dataset metadata of step ③. */
export interface MetaState {
  labCourse: string;
  expTitle: string;
  expDescription: string;
  deviceUnderTest: string;
  notes: string;
}

export type MetaField = keyof MetaState;

/** Fields that can be remembered across uploads ("merken"): the metadata plus the whole target. */
export type RememberKey = MetaField | "target";

export const REMEMBER_KEYS: readonly RememberKey[] = [
  "target",
  "labCourse",
  "expTitle",
  "expDescription",
  "deviceUnderTest",
  "notes",
];

/** Upload target of step ②: picked from the lists, or typed under "Erweitert". */
export interface TargetState {
  mode: "list" | "manual";
  selection: ObjectSelection;
  manualExperimentId: string;
  manualObjectId: string;
}

export type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; result: CommitResponse; count: number }
  | { status: "error"; message: string };

export interface WizardState {
  step: WizardStep;
  /** Capture ids that are still ticked in step ①. */
  includedIds: string[];
  target: TargetState;
  meta: MetaState;
  /** true = remember this field for the next upload. */
  pinned: Record<RememberKey, boolean>;
  submit: SubmitState;
}
