import { useState } from "react";
import { NotebookPen, SlidersHorizontal } from "lucide-react";
import { de } from "../../../../i18n/de";
import { Button } from "../../../components/ui/button";
import { ContentSheet } from "./SettingsSheet";
import type { ControlSlots } from "./slots";

const t = de.control.page.layout;

/**
 * 768-1023 px: plot full width on top (~55 % of the height), measurements
 * below, a bottom action bar (Live, Aufnahme speichern, Notiz, Einstellungen)
 * and bottom sheets for settings (accordion) and the last capture.
 *
 * @param props.slots - Page slots
 * @returns The main region and the action bar
 */
export function PortraitLayout({ slots }: { slots: ControlSlots }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The plot takes ~55 % of the height but never less than its toolbar,
          canvas and readout bar need; the rest scrolls. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="h-[55%] min-h-[27rem] p-2">{slots.plot}</div>
        <div className="px-2 pb-2">{slots.readouts}</div>
      </div>
      <div
        role="toolbar"
        aria-label={t.actionBar}
        className="flex shrink-0 flex-wrap items-start gap-2 border-t-2 border-(--lab-border) bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        {slots.actions(
          "bar",
          <>
            <Button variant="secondary" onClick={() => setNoteOpen(true)}>
              <NotebookPen aria-hidden />
              {t.note}
            </Button>
            <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
              <SlidersHorizontal aria-hidden />
              {t.settings}
            </Button>
          </>,
        )}
      </div>

      <ContentSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        side="bottom"
        title={t.settingsSheetTitle}
        description={t.settingsSheetDescription}
      >
        {settingsOpen && slots.inspector({ layout: "accordion" })}
      </ContentSheet>
      <ContentSheet
        open={noteOpen}
        onOpenChange={setNoteOpen}
        side="bottom"
        title={t.noteSheetTitle}
        description={t.noteSheetDescription}
      >
        {noteOpen && slots.lastCapture("compact")}
      </ContentSheet>
    </div>
  );
}
