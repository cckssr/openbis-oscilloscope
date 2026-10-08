import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { de } from "../../../../i18n/de";
import { CenterColumn } from "./CenterColumn";
import { InspectorRail } from "./InspectorRail";
import { ContentSheet } from "./SettingsSheet";
import type { ControlSlots, InspectorGroupInfo } from "./slots";

const t = de.control.page.layout;

/**
 * 1024-1279 px: 72 px action rail on the left, plot in the middle (~880 px)
 * and a slim rail on the right whose icons open the settings as a sheet.
 *
 * @param props.slots - Page slots
 * @param props.groups - Settings groups for the right rail
 * @returns The main region
 */
export function LandscapeLayout({ slots, groups }: { slots: ControlSlots; groups: InspectorGroupInfo[] }) {
  const [settingsGroup, setSettingsGroup] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <div className="grid h-full min-h-0 grid-cols-[72px_minmax(0,1fr)_auto]">
      <div className="flex min-h-0 flex-col items-center gap-2 overflow-y-auto border-r-2 border-(--lab-border) bg-white p-1">
        {slots.actions(
          "rail",
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded border-2 border-(--lab-border) bg-white py-1.5 text-[11px] font-medium text-(--lab-text-primary) hover:bg-(--lab-panel) coarse:min-h-[3.25rem]"
          >
            <NotebookPen className="size-5" aria-hidden />
            {t.note}
          </button>,
        )}
      </div>
      <CenterColumn plot={slots.plot} readouts={slots.readouts} />
      <InspectorRail groups={groups} onSelect={setSettingsGroup} />

      <ContentSheet
        open={settingsGroup !== null}
        onOpenChange={(o) => !o && setSettingsGroup(null)}
        side="right"
        title={t.settingsSheetTitle}
        description={t.settingsSheetDescription}
      >
        {settingsGroup !== null && slots.inspector({ layout: "tabs", initialGroupId: settingsGroup })}
      </ContentSheet>
      <ContentSheet
        open={noteOpen}
        onOpenChange={setNoteOpen}
        side="left"
        title={t.noteSheetTitle}
        description={t.noteSheetDescription}
      >
        {noteOpen && slots.lastCapture("compact")}
      </ContentSheet>
    </div>
  );
}
