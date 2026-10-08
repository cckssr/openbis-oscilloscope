import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { de } from "../../../i18n/de";
import { OpenBISObjectSelector } from "../OpenBISObjectSelector";
import { Field, inputClass } from "./Field";
import type { WizardState } from "./types";
import { EXPERIMENT_ID_PATTERN, OBJECT_ID_PATTERN, type WizardAction } from "./wizardReducer";

const t = de.archive.wizard.target;

interface TargetStepProps {
  token: string;
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}

/**
 * Step ②: Gruppe → Versuch → Probe/Objekt, with manual identifier entry hidden under "Erweitert".
 * @param props - See {@link TargetStepProps}
 * @returns The target picker
 */
export function TargetStep({ token, state, dispatch }: TargetStepProps) {
  const { target, pinned } = state;
  const manual = target.mode === "manual";
  const remember = { pinned: pinned.target, onToggle: () => dispatch({ type: "togglePin", key: "target" }) };

  const experimentError =
    target.manualExperimentId && !EXPERIMENT_ID_PATTERN.test(target.manualExperimentId.trim())
      ? t.manualInvalid
      : null;
  const objectError =
    target.manualObjectId && !OBJECT_ID_PATTERN.test(target.manualObjectId.trim())
      ? t.manualObjectInvalid
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold">{t.heading}</h3>
        <p className="help-text">{t.intro}</p>
      </div>

      {!manual && (
        <OpenBISObjectSelector
          token={token}
          value={target.selection}
          onChange={(selection) => dispatch({ type: "setSelection", selection })}
          remember={remember}
          onLoadError={() => dispatch({ type: "setTargetMode", mode: "manual" })}
        />
      )}

      <div className="rounded border-2 border-(--lab-border)">
        <button
          type="button"
          aria-expanded={manual}
          onClick={() => dispatch({ type: "setTargetMode", mode: manual ? "list" : "manual" })}
          className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm font-medium text-(--lab-text-secondary) hover:text-(--lab-text-primary) coarse:min-h-12"
        >
          {manual ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
          {t.advanced}
        </button>
        {manual && (
          <div className="flex flex-col gap-4 border-t-2 border-(--lab-border) p-3">
            <p className="help-text">{t.advancedHint}</p>
            <Field
              htmlFor="manual-experiment"
              label={t.manualExperiment}
              required
              help={t.manualExperimentHelp}
              error={experimentError}
            >
              <Input
                id="manual-experiment"
                value={target.manualExperimentId}
                placeholder="/RAUM/PROJEKT/EXPERIMENT"
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} font-mono`}
                onChange={(e) =>
                  dispatch({ type: "setManual", field: "manualExperimentId", value: e.target.value })
                }
              />
            </Field>
            <Field
              htmlFor="manual-object"
              label={t.manualObject}
              optional
              help={t.manualObjectHelp}
              error={objectError}
            >
              <Input
                id="manual-object"
                value={target.manualObjectId}
                placeholder="/RAUM/PROBE"
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} font-mono`}
                onChange={(e) =>
                  dispatch({ type: "setManual", field: "manualObjectId", value: e.target.value })
                }
              />
            </Field>
            <Button
              variant="link"
              size="sm"
              className="self-start"
              onClick={() => dispatch({ type: "setTargetMode", mode: "list" })}
            >
              {t.useList}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
