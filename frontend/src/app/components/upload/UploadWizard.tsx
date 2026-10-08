/**
 * Upload wizard dialog: ① Auswahl prüfen → ② Ziel → ③ Angaben → ④ Bestätigen →
 * ⑤ Ergebnis. Full-screen on phones/tablets in portrait, a centred dialog on wide screens.
 */
import { useMemo, useReducer } from "react";
import { ArrowRight, Upload } from "lucide-react";
import { commitSession } from "../../../api/sessions";
import { de } from "../../../i18n/de";
import { errorMessage, notifyError } from "../../../lib/notify";
import { useAuth } from "../../context/AuthContext";
import type { Capture } from "../../pages/archive/groupArtifacts";
import { DisabledReason } from "../common";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { ConfirmStep } from "./ConfirmStep";
import { DetailsStep } from "./DetailsStep";
import { loadPrefs, prefsFromState, savePrefs } from "./rememberedMetadata";
import { ResultStep } from "./ResultStep";
import { ReviewStep } from "./ReviewStep";
import { Stepper } from "./Stepper";
import { TargetStep } from "./TargetStep";
import {
  buildCommitRequest,
  initialWizardState,
  stepIssue,
  wizardReducer,
} from "./wizardReducer";
import { STEP_ORDER } from "./types";

const t = de.archive.wizard;

interface UploadWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Captures currently selected for upload (snapshot taken when the wizard opens). */
  captures: Capture[];
  token: string;
  sessionId: string;
  screenshotUrls: Record<string, string>;
  /** Called after a successful upload so the archive can refresh (A14: rows turn "Hochgeladen ✓"). */
  onUploaded: () => void;
}

/**
 * The wizard shell. The body mounts only while open, so every opening starts
 * with fresh state (and freshly remembered values).
 * @param props - See {@link UploadWizardProps}
 * @returns The dialog
 */
export function UploadWizard({
  open,
  onOpenChange,
  ...rest
}: UploadWizardProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <WizardDialogContent {...rest} onClose={() => onOpenChange(false)} />
      )}
    </Dialog>
  );
}

function WizardDialogContent({
  captures: initialCaptures,
  token,
  sessionId,
  screenshotUrls,
  onUploaded,
  onClose,
}: Omit<UploadWizardProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const { user } = useAuth();
  const userId = user?.user_id ?? "anonymous";
  // Snapshot: the archive refresh after a successful upload must not change what the wizard shows.
  const captures = useMemo(() => initialCaptures, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, dispatch] = useReducer(wizardReducer, undefined, () =>
    initialWizardState(
      initialCaptures.map((c) => c.id),
      loadPrefs(userId),
    ),
  );

  const included = captures.filter((c) => state.includedIds.includes(c.id));
  const submitting = state.submit.status === "submitting";
  const issue = stepIssue(state, state.step);
  const stepNo = STEP_ORDER.indexOf(state.step) + 1;

  const submit = async () => {
    dispatch({ type: "submitStart" });
    try {
      const body = buildCommitRequest(
        state,
        included.flatMap((c) => c.artifactIds),
      );
      const result = await commitSession(token, sessionId, body);
      savePrefs(userId, prefsFromState(state));
      dispatch({ type: "submitSuccess", result, count: included.length });
      onUploaded();
    } catch (err) {
      notifyError(err, t.result.failed, t.result.toastError);
      dispatch({
        type: "submitError",
        message: errorMessage(err, t.result.failed),
      });
    }
  };

  const body = (() => {
    switch (state.step) {
      case "review":
        return (
          <ReviewStep
            captures={captures}
            includedIds={state.includedIds}
            screenshotUrls={screenshotUrls}
            dispatch={dispatch}
          />
        );
      case "target":
        return <TargetStep token={token} state={state} dispatch={dispatch} />;
      case "details":
        return <DetailsStep state={state} dispatch={dispatch} />;
      case "confirm":
        return <ConfirmStep state={state} captures={captures} />;
      case "result":
        return <ResultStep submit={state.submit} count={included.length} />;
    }
  })();

  const footer = (() => {
    if (state.step === "result") {
      if (state.submit.status === "success")
        return (
          <>
            <span />
            <Button variant="primary" onClick={onClose}>
              {t.nav.done}
            </Button>
          </>
        );
      if (state.submit.status === "error")
        return (
          <>
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: "goto", step: "confirm" })}
            >
              {t.nav.backToConfirm}
            </Button>
            <Button variant="primary" onClick={submit}>
              {t.nav.retry}
            </Button>
          </>
        );
      return null;
    }
    const back =
      state.step === "review" ? (
        <Button variant="secondary" onClick={onClose}>
          {t.nav.cancel}
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => dispatch({ type: "back" })}>
          {t.nav.back}
        </Button>
      );
    const forward =
      state.step === "confirm" ? (
        <Button variant="primary" onClick={submit}>
          <Upload /> {t.nav.submit}
        </Button>
      ) : (
        <DisabledReason reason={issue}>
          <Button
            variant="primary"
            disabled={!!issue}
            onClick={() => dispatch({ type: "next" })}
          >
            {t.nav.next} <ArrowRight />
          </Button>
        </DisabledReason>
      );
    return (
      <>
        {back}
        {forward}
      </>
    );
  })();

  return (
    <DialogContent
      aria-describedby="upload-wizard-description"
      onEscapeKeyDown={(e) => submitting && e.preventDefault()}
      onInteractOutside={(e) => e.preventDefault()}
      className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-lg md:max-w-3xl"
    >
      <div className="flex flex-col gap-3 border-b-2 border-(--lab-border) px-4 pt-4 pb-3 pr-12 sm:px-6 sm:pr-14">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <DialogTitle className="text-lg font-semibold">{t.title}</DialogTitle>
          {state.step !== "result" && (
            <span className="text-sm text-(--lab-text-secondary)">
              {t.stepOf(stepNo, 4)}
            </span>
          )}
        </div>
        <DialogDescription id="upload-wizard-description" className="sr-only">
          {t.description}
        </DialogDescription>
        <Stepper
          current={state.step}
          onStepClick={(step) => dispatch({ type: "goto", step })}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {body}
      </div>

      {footer && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-t-2 border-(--lab-border) px-4 py-3 sm:px-6">
          {footer}
        </div>
      )}
    </DialogContent>
  );
}
