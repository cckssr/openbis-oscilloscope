import { CircleAlert, ExternalLink } from "lucide-react";
import { Progress } from "../ui/progress";
import { de } from "../../../i18n/de";
import type { SubmitState } from "./types";

const t = de.archive.wizard.result;

/**
 * Step ⑤: progress while uploading, then the success panel with the openBIS
 * link (or the dropbox note), or the error panel.
 * @param props.submit - Current submit state
 * @param props.count - Number of captures being uploaded
 * @returns The outcome panel
 */
export function ResultStep({
  submit,
  count,
}: {
  submit: SubmitState;
  count: number;
}) {
  if (submit.status === "submitting") {
    return (
      <div
        className="flex flex-col gap-3 py-6"
        role="status"
        aria-live="polite"
      >
        <p className="text-base font-medium">{t.uploading(count)}</p>
        {/* The backend call is a single request, so the bar is indeterminate. */}
        <Progress className="animate-pulse" value={66} />
        <p className="help-text">{t.uploadingHint}</p>
      </div>
    );
  }
  if (submit.status === "success") {
    const { result } = submit;
    return (
      <div
        className="flex flex-col items-start gap-3 py-4"
        role="status"
        aria-live="polite"
      >
        <p className="text-lg font-semibold text-(--lab-success)">
          {t.success(submit.count)}
        </p>
        {result.permId && (
          <p className="font-mono text-xs text-(--lab-text-secondary)">
            {t.successDataset(result.permId)}
          </p>
        )}
        {result.openbis_url ? (
          <a
            href={result.openbis_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded border-2 border-(--lab-accent) bg-white px-4 text-sm font-medium text-(--lab-accent) hover:bg-(--lab-accent) hover:text-white coarse:h-11"
          >
            {t.openInOpenbis}
            <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : (
          <p className="text-sm text-(--lab-text-secondary)">{t.dropbox}</p>
        )}
      </div>
    );
  }
  if (submit.status === "error") {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded border-2 border-(--lab-danger) bg-white p-4"
      >
        <div className="flex items-center gap-2 font-semibold text-(--lab-danger)">
          <CircleAlert className="size-5" aria-hidden />
          {t.failed}
        </div>
        <p className="text-sm break-words text-(--lab-text-primary)">
          {submit.message}
        </p>
        <p className="help-text">{t.failedHint}</p>
      </div>
    );
  }
  return null;
}
