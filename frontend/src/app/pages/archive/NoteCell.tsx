import { useState } from "react";
import { Pencil } from "lucide-react";
import { de } from "../../../i18n/de";

const t = de.archive.note;

interface NoteCellProps {
  value: string | null;
  /** false for screenshots and legacy traces — the note is shown read-only. */
  editable: boolean;
  /** Controlled editing state, so the row menu can start editing too. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Called with the trimmed text when editing ends with a changed value. */
  onSave: (text: string) => void;
}

/** The text field; mounted only while editing, so its draft starts from the current note. */
function NoteInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (save: boolean, text: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <input
      autoFocus
      value={draft}
      aria-label={t.aria}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(true, draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(true, draft);
        else if (e.key === "Escape") {
          e.stopPropagation();
          onDone(false, draft);
        }
      }}
      className="h-8 w-full rounded border-2 border-(--lab-accent) bg-white px-2 text-sm outline-none coarse:h-10"
    />
  );
}

/**
 * Inline-editable note: click to edit, Enter or blur saves, Escape cancels.
 * @param props - See {@link NoteCellProps}
 * @returns The note cell content
 */
export function NoteCell({
  value,
  editable,
  editing,
  onEditingChange,
  onSave,
}: NoteCellProps) {
  if (editing && editable) {
    return (
      <NoteInput
        initial={value ?? ""}
        onDone={(save, text) => {
          onEditingChange(false);
          if (save && text.trim() !== (value ?? "")) onSave(text.trim());
        }}
      />
    );
  }

  if (!editable) {
    return (
      <span
        className="block truncate text-sm text-(--lab-text-secondary)"
        title={t.unavailable}
      >
        {value || "—"}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onEditingChange(true)}
      title={t.edit}
      className="group flex min-h-8 w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm hover:bg-(--lab-panel) coarse:min-h-10"
    >
      <span
        className={`min-w-0 flex-1 line-clamp-2 break-words ${value ? "text-(--lab-text-primary)" : "text-(--lab-text-secondary) italic"}`}
      >
        {value || t.placeholder}
      </span>
      <Pencil
        className="size-3.5 shrink-0 text-(--lab-text-secondary) opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 coarse:opacity-100"
        aria-hidden
      />
    </button>
  );
}
