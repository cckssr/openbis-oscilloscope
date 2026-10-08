import { de } from "../../../../i18n/de";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../../components/ui/resizable";
import { CenterColumn } from "./CenterColumn";
import { SidePanel } from "./SidePanel";
import type { ControlSlots } from "./slots";

const t = de.control.page.layout;

/** Below this width the side panels start narrower so the plot keeps >= 55 %. */
const COMPACT_QUERY = "(max-width: 1399px)";

/** Default side-panel widths (px); only read when the panels mount. */
function defaultWidths(): { actions: number; inspector: number } {
  const compact = typeof window !== "undefined" && window.matchMedia?.(COMPACT_QUERY).matches;
  return compact ? { actions: 230, inspector: 300 } : { actions: 260, inspector: 340 };
}

/**
 * >= 1280 px: collapsible actions column (260 px; collapsed it keeps the
 * action buttons as icons), plot centre and a
 * resizable settings inspector (340 px, min 300 px). Below 1400 px both side
 * panels start narrower (230 / 300 px).
 *
 * @param props.slots - Page slots
 * @returns The main region
 */
export function DesktopLayout({ slots }: { slots: ControlSlots }) {
  const widths = defaultWidths();
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <SidePanel
        id="actions"
        side="left"
        defaultSize={widths.actions}
        minSize={210}
        maxSize={360}
        collapseLabel={t.collapseActions}
        expandLabel={t.expandActions}
        collapsedContent={slots.actions("icon")}
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
        defaultSize={widths.inspector}
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
