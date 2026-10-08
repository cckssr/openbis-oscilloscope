import { cn } from "../../../components/ui/utils";
import { DesktopLayout } from "./DesktopLayout";
import { LandscapeLayout } from "./LandscapeLayout";
import { PortraitLayout } from "./PortraitLayout";
import type { ControlSlots, InspectorGroupInfo } from "./slots";
import { useBreakpoint, type Breakpoint } from "./useBreakpoint";

export interface ControlLayoutProps {
  slots: ControlSlots;
  /** Settings groups, used by the landscape icon rail. */
  groups: InspectorGroupInfo[];
  /** Overrides the viewport-derived breakpoint (tests). */
  breakpoint?: Breakpoint;
}

/**
 * Places the page slots per breakpoint (review §3.2). A CSS grid with named
 * areas stacks header, banners, stepper, main region and status bar; the main
 * region is arranged by the breakpoint-specific layout. Features only fill
 * slots and never know where they end up.
 *
 * @param props - See {@link ControlLayoutProps}
 * @returns The full-height page shell
 */
export function ControlLayout({ slots, groups, breakpoint }: ControlLayoutProps) {
  const detected = useBreakpoint();
  const bp = breakpoint ?? detected;

  return (
    <div
      data-breakpoint={bp}
      className={cn("grid h-dvh min-h-0 w-full min-w-0 overflow-hidden bg-(--lab-bg)", "grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto]")}
      style={{ gridTemplateAreas: '"header" "stepper" "banners" "main" "statusbar"' }}
    >
      <div style={{ gridArea: "header" }}>{slots.header}</div>
      <div style={{ gridArea: "stepper" }}>{slots.stepper}</div>
      <div style={{ gridArea: "banners" }} className="empty:hidden">
        {slots.banners}
      </div>
      <main style={{ gridArea: "main" }} className="min-h-0 min-w-0">
        {bp === "desktop" && <DesktopLayout slots={slots} />}
        {bp === "landscape" && <LandscapeLayout slots={slots} groups={groups} />}
        {bp === "portrait" && <PortraitLayout slots={slots} />}
      </main>
      <div style={{ gridArea: "statusbar" }}>{slots.statusbar}</div>
    </div>
  );
}
