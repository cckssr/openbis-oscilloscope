/**
 * Workflow strip (review §4.1) as a pure selector over the store state:
 * ① Gerät übernehmen ② Signal einstellen (optional) ③ Aufnehmen
 * ④ Notieren & auswählen ⑤ Hochladen, plus the one-sentence "Als Nächstes" hint.
 */
import { de } from "../../../i18n/de";
import type {
  DeviceSessionState,
  Workflow,
  WorkflowStep,
  WorkflowStepId,
} from "./types";

const t = de.control.session;

type StepState = WorkflowStep["state"];

/**
 * Computes the workflow steps and the next-step hint.
 * @param state - Current state of a device session store
 * @returns Five steps with their state and the German "next" sentence
 */
export function selectWorkflow(state: DeviceSessionState): Workflow {
  const { lock, settings, counts, frame, live, device } = state;
  const held = lock.status === "held";
  const joined = held || lock.status === "passive";
  const hasData = counts.total > 0;
  const unavailable =
    !joined &&
    (device?.state === "OFFLINE" ||
      device?.state === "ERROR" ||
      (device?.state === "LOCKED" && !device.lock?.is_mine));

  const take: StepState = joined ? "done" : unavailable ? "blocked" : "active";

  let setup: StepState;
  if (settings.touched) setup = "done";
  else if (held) setup = hasData ? "todo" : "active";
  else setup = hasData ? "todo" : "blocked";

  let capture: StepState;
  if (hasData) capture = "done";
  else if (held) capture = settings.touched ? "active" : "todo";
  else capture = "blocked";

  let annotate: StepState;
  if (counts.withNoteOrFlag > 0) annotate = "done";
  else if (hasData) annotate = "active";
  else annotate = held ? "todo" : "blocked";

  let upload: StepState;
  if (counts.flagged > 0) upload = "active";
  else if (counts.uploaded > 0) upload = "done";
  else upload = hasData ? "todo" : "blocked";

  const step = (
    id: WorkflowStepId,
    label: string,
    state: StepState,
    optional?: boolean,
  ): WorkflowStep => ({ id, label, state, ...(optional ? { optional } : {}) });

  return {
    steps: [
      step("take", t.steps.take, take),
      step("setup", t.steps.setup, setup, true),
      step("capture", t.steps.capture, capture),
      step("annotate", t.steps.annotate, annotate),
      step("upload", t.steps.upload, upload),
    ],
    next: nextHint(state, { held, hasData, hasFrame: frame !== null || live.status === "on" }),
  };
}

function nextHint(
  state: DeviceSessionState,
  ctx: { held: boolean; hasData: boolean; hasFrame: boolean },
): string {
  const { lock, counts } = state;
  if (lock.status === "passive") return t.next.passive;
  if (lock.status === "lost") return t.next.lost;

  // Data hints apply whether or not the device is held (the archive stays reachable).
  if (counts.flagged > 0) return t.next.upload;
  if (ctx.hasData && counts.notUploaded > 0) return t.next.annotate;

  if (!ctx.held) return ctx.hasData ? t.next.allUploaded : t.next.take;
  if (ctx.hasData) return t.next.allUploaded;
  return ctx.hasFrame ? t.next.capture : t.next.live;
}
