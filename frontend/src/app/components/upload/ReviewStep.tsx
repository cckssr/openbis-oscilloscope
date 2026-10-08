import { Image as ImageIcon } from "lucide-react";
import { de } from "../../../i18n/de";
import { formatTime } from "../../../lib/units";
import { ChannelChips } from "../../pages/archive/ChannelChips";
import type { Capture } from "../../pages/archive/groupArtifacts";
import type { WizardAction } from "./wizardReducer";

const t = de.archive.wizard.review;

interface ReviewStepProps {
  captures: Capture[];
  includedIds: string[];
  screenshotUrls: Record<string, string>;
  dispatch: (action: WizardAction) => void;
}

/**
 * Step ①: what will be uploaded. Every capture can be unticked.
 * @param props - See {@link ReviewStepProps}
 * @returns The list of selected captures
 */
export function ReviewStep({ captures, includedIds, screenshotUrls, dispatch }: ReviewStepProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">{t.heading}</h3>
        <p className="help-text">{t.intro}</p>
      </div>
      <p className="text-sm font-medium text-(--lab-text-primary)" aria-live="polite">
        {t.count(includedIds.length, captures.length)}
      </p>
      {captures.length === 0 ? (
        <p className="text-sm text-(--lab-text-secondary)">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-(--lab-border) rounded border-2 border-(--lab-border)">
          {captures.map((c) => {
            const included = includedIds.includes(c.id);
            const time = formatTime(c.createdAt);
            const thumb = screenshotUrls[c.artifactIds[0]];
            return (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-(--lab-panel) coarse:py-3">
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={() => dispatch({ type: "toggleCapture", id: c.id })}
                    aria-label={t.rowAria(time)}
                    className="size-4.5 shrink-0 accent-(--lab-accent) coarse:size-5"
                  />
                  <span className="w-20 shrink-0 font-mono text-sm tabular-nums">{time}</span>
                  <span className="w-28 shrink-0 sm:w-40">
                    <ChannelChips capture={c} thumbnailUrl={thumb} />
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${c.annotation ? "" : "text-(--lab-text-secondary) italic"}`}
                  >
                    {c.annotation || t.noNote}
                  </span>
                  {c.kind === "screenshot" && !thumb && (
                    <ImageIcon className="size-4 shrink-0 text-(--lab-text-secondary)" aria-hidden />
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
