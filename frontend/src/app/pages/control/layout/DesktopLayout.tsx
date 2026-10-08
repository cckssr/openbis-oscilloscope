import { de } from "../../../../i18n/de";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../../components/ui/resizable";
import { CenterColumn } from "./CenterColumn";
import { SidePanel } from "./SidePanel";
import type { ControlSlots } from "./slots";

const t = de.control.page.layout;

/**
 * >= 1280 px: collapsible actions column (260 px), plot centre and a
 * resizable settings inspector (340 px, min 300 px).
 *
 * @param props.slots - Page slots
 * @returns The main region
 */
export function DesktopLayout({ slots }: { slots: ControlSlots }) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <SidePanel
        id="actions"
        side="left"
        defaultSize={260}
        minSize={220}
        maxSize={360}
        collapseLabel={t.collapseActions}
        expandLabel={t.expandActions}
      >
        <div className="flex flex-col gap-4 pt-6">{slots.actions("column")}</div>
        <div className="mt-4">{slots.lastCapture("card")}</div>
      </SidePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="plot" minSize={400}>
        <CenterColumn plot={slots.plot} readouts={slots.readouts} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <SidePanel
        id="inspector"
        side="right"
        defaultSize={340}
        minSize={300}
        maxSize={560}
        collapseLabel={t.collapseInspector}
        expandLabel={t.expandInspector}
      >
        <div className="pt-6">{slots.inspector({ layout: "tabs" })}</div>
      </SidePanel>
    </ResizablePanelGroup>
  );
}
