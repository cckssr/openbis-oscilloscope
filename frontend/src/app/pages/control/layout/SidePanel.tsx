import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ResizablePanel } from "../../../components/ui/resizable";
import { usePanelRef } from "react-resizable-panels";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../components/ui/utils";

/** Width of a collapsed side panel (px): just room for the expand button. */
export const COLLAPSED_WIDTH = 44;

export interface SidePanelProps {
  /** Stable panel id (react-resizable-panels). */
  id: string;
  /** Which side of the plot the panel sits on; decides the chevron direction. */
  side: "left" | "right";
  defaultSize: number;
  minSize: number;
  maxSize: number;
  /** Accessible names of the collapse and expand buttons. */
  collapseLabel: string;
  expandLabel: string;
  children: ReactNode;
  className?: string;
}

/**
 * Resizable, collapsible side region of the desktop layout. Collapsed, it
 * shrinks to a thin strip holding only the expand button. Scrolls itself.
 *
 * @param props - See {@link SidePanelProps}
 * @returns A `ResizablePanel` with its content
 */
export function SidePanel({
  id,
  side,
  defaultSize,
  minSize,
  maxSize,
  collapseLabel,
  expandLabel,
  children,
  className,
}: SidePanelProps) {
  const ref = usePanelRef();
  const [collapsed, setCollapsed] = useState(false);
  // The chevron points toward the edge the panel collapses into.
  const Collapse = side === "left" ? ChevronLeft : ChevronRight;
  const Expand = side === "left" ? ChevronRight : ChevronLeft;

  return (
    <ResizablePanel
      id={id}
      panelRef={ref}
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      collapsible
      collapsedSize={COLLAPSED_WIDTH}
      groupResizeBehavior="preserve-pixel-size"
      onResize={() => setCollapsed(ref.current?.isCollapsed() ?? false)}
      className={cn("bg-white", className)}
    >
      {collapsed ? (
        <div className="flex h-full justify-center pt-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={expandLabel}
            title={expandLabel}
            onClick={() => ref.current?.expand()}
          >
            <Expand />
          </Button>
        </div>
      ) : (
        <div className="relative flex h-full min-w-0 flex-col">
          <div className={cn("absolute top-1 z-10", side === "left" ? "right-1" : "left-1")}>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 coarse:size-10"
              aria-label={collapseLabel}
              title={collapseLabel}
              onClick={() => ref.current?.collapse()}
            >
              <Collapse />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">{children}</div>
        </div>
      )}
    </ResizablePanel>
  );
}
