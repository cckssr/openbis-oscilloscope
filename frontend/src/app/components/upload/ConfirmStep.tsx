import type { ReactNode } from "react";
import { de } from "../../../i18n/de";
import type { Capture } from "../../pages/archive/groupArtifacts";
import type { WizardState } from "./types";
import { targetIdentifiers } from "./wizardReducer";

const t = de.archive.wizard.confirm;
const d = de.archive.wizard.details;

interface ConfirmStepProps {
  state: WizardState;
  captures: Capture[];
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-(--lab-text-secondary)">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-(--lab-text-primary)">
        {children || t.none}
      </dd>
    </div>
  );
}

/**
 * Step ④: read-only summary before the single "Jetzt hochladen" button.
 * @param props - See {@link ConfirmStepProps}
 * @returns The summary
 */
export function ConfirmStep({ state, captures }: ConfirmStepProps) {
  const included = captures.filter((c) => state.includedIds.includes(c.id));
  const { mode, selection } = state.target;
  const ids = targetIdentifiers(state);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">{t.heading}</h3>
        <p className="help-text">{t.intro}</p>
      </div>
      <dl className="divide-y divide-(--lab-border) rounded border-2 border-(--lab-border) px-3">
        <Row label={t.captures}>
          {de.archive.summary.captures(included.length)}
        </Row>
        {mode === "list" && <Row label={t.group}>{selection.projectLabel}</Row>}
        <Row label={t.experiment}>
          {mode === "list" ? selection.collectionLabel : ids.experimentId}
          {ids.experimentId && mode === "list" && (
            <span className="block font-mono text-xs text-(--lab-text-secondary)">
              {ids.experimentId}
            </span>
          )}
        </Row>
        <Row label={t.object}>
          {mode === "list" ? selection.objectLabel : ids.objectId}
        </Row>
        <Row label={d.labCourse}>{state.meta.labCourse}</Row>
        <Row label={d.expTitle}>{state.meta.expTitle.trim()}</Row>
        <Row label={d.expDescription}>{state.meta.expDescription.trim()}</Row>
        <Row label={d.deviceUnderTest}>{state.meta.deviceUnderTest.trim()}</Row>
        <Row label={d.notes}>{state.meta.notes.trim()}</Row>
      </dl>
    </div>
  );
}
