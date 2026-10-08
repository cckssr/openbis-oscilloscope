import { useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { de } from "../../../../i18n/de";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Textarea } from "../../../components/ui/textarea";
import { cn } from "../../../components/ui/utils";
import { useDeviceActions } from "../actions/session";
import { NOTE_INPUT_ID } from "../actions/useControlShortcuts";

const t = de.control.actions.lastCapture;

export interface CaptureNoteProps {
  deviceId: string;
  /** Note as stored on the capture. */
  note: string;
  flagged: boolean;
  /** false: read-only (this tab does not control the device). */
  canEdit: boolean;
  compact?: boolean;
}

interface Attempt {
  text: string;
  state: "saving" | "settled";
}

/**
 * Note field and "Zum Hochladen auswählen" checkbox of one capture. The
 * draft lives in local state, so live frames and other store updates never
 * touch what the student is typing. Mount it with `key={acquisitionId}` so a
 * new capture starts with its own note. Saves on Enter (Umschalt+Enter =
 * new line), on blur and via the button.
 *
 * @param props - See {@link CaptureNoteProps}
 * @returns The note editor and the upload checkbox
 */
export function CaptureNote({ deviceId, note, flagged, canEdit, compact = false }: CaptureNoteProps) {
  const actions = useDeviceActions(deviceId);
  const [draft, setDraft] = useState(note);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [optimisticFlag, setOptimisticFlag] = useState<boolean | null>(null);

  const dirty = draft !== note;
  const saving = attempt?.state === "saving";

  const save = async () => {
    if (!canEdit || !dirty || saving) return;
    const text = draft;
    setAttempt({ text, state: "saving" });
    await actions.saveNote(text);
    setAttempt({ text, state: "settled" });
  };

  const toggleFlag = async (checked: boolean) => {
    setOptimisticFlag(checked);
    await actions.setCaptureFlag(checked);
    setOptimisticFlag(null);
  };

  // The store updates `note` only when the write succeeded, so equal text means saved.
  let status: { icon: React.ReactNode; text: string; tone: string } | null = null;
  if (saving) {
    status = { icon: <Loader2 className="size-3.5 animate-spin" />, text: t.noteSaving, tone: "text-(--lab-text-secondary)" };
  } else if (attempt && !dirty && attempt.text === note) {
    status = { icon: <Check className="size-3.5" />, text: t.noteSaved, tone: "text-(--lab-success)" };
  } else if (attempt && dirty && attempt.text === draft) {
    status = { icon: <TriangleAlert className="size-3.5" />, text: t.noteFailed, tone: "text-(--lab-danger)" };
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label htmlFor={NOTE_INPUT_ID} className="text-xs font-medium text-(--lab-text-secondary)">
          {t.noteLabel}
        </label>
        <Textarea
          id={NOTE_INPUT_ID}
          value={draft}
          rows={compact ? 1 : 2}
          readOnly={!canEdit}
          placeholder={t.notePlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void save();
            }
          }}
          className={cn("text-sm", compact ? "min-h-9 py-1.5" : "min-h-16")}
        />
        <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p
            role="status"
            aria-live="polite"
            data-testid="note-status"
            className={cn("flex items-center gap-1 whitespace-nowrap text-xs", status?.tone)}
          >
            {status && (
              <>
                {status.icon}
                {status.text}
              </>
            )}
          </p>
          {canEdit && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {t.saveNote}
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 coarse:min-h-11">
        <Checkbox
          id="capture-flag-input"
          checked={optimisticFlag ?? flagged}
          disabled={!canEdit}
          onCheckedChange={(v) => void toggleFlag(v === true)}
          className="size-5 coarse:size-6"
        />
        <label htmlFor="capture-flag-input" className="text-sm">
          {t.flag}
        </label>
      </div>
      {!canEdit && <p className="help-text">{t.readOnly}</p>}
    </div>
  );
}
