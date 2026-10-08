import { useState } from "react";
import { NotebookPen, SlidersHorizontal } from "lucide-react";
import { de } from "../../../../i18n/de";
import { Button } from "../../../components/ui/button";
import { ContentSheet } from "./SettingsSheet";
import type { ControlSlots } from "./slots";

const t = de.control.page.layout;

/**
 * 768-1023 px: plot full width on top taking all height the header, stepper
 * and action bar leave (>= 50 % of a 1024 px viewport), the (collapsed by
 * default) measurements below, a bottom action bar of at most two rows (Live,
 * Aufnahme speichern, Notiz, Einstellungen, "Mehr ▾") and bottom sheets for
 * settings (accordion) and the last capture.
 *
 * @param props.slots - Page slots
 * @returns The main region and the action bar
 */
export function PortraitLayout({ slots }: { slots: ControlSlots }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The plot takes every pixel the other rows leave, but never less than its
          toolbar, canvas and readout bar need (then the region scrolls). */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex h-full flex-col gap-2 p-2">
          <div className="min-h-[26rem] flex-1">{slots.plot}</div>
          <div className="shrink-0">{slots.readouts}</div>
        </div>
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
