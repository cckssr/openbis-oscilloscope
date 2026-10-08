import { ChevronDown, Database, Monitor } from "lucide-react";
import { de } from "../../../../i18n/de";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { cn } from "../../../components/ui/utils";
import { withShortcut } from "../actions/shortcuts";
import type { Availability } from "../actions/availability";
import type { ActionLayout } from "../actions/layout";

const t = de.control.actions.capture;

export interface CaptureMenuProps {
  layout: ActionLayout;
  fullResolution: Availability;
  screenshot: Availability;
  /** Whole menu disabled (nothing in it can be used). */
  disabled: boolean;
  onFullResolution: () => void;
  onScreenshot: () => void;
}

const TRIGGER_CLASS: Record<ActionLayout, string> = {
  icon: "h-5 w-full rounded-t-none border-t-0 px-0 coarse:h-7",
  column: "h-auto self-stretch rounded-l-none border-l border-l-white/50 px-2",
  rail: "h-7 w-full rounded-t-none border-t-0 px-0 text-[11px] coarse:h-10",
  bar: "h-11 rounded-l-none border-l border-l-white/50 px-2 coarse:h-12",
};

function MenuEntry({
  icon,
  label,
  hint,
  availability,
  onSelect,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  availability: Availability;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <DropdownMenuItem
      disabled={!!availability.reason}
      onSelect={onSelect}
      data-testid={testId}
      className="items-start gap-2 py-2 coarse:min-h-11"
    >
      <span className="mt-0.5">{icon}</span>
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-(--lab-text-secondary)">
          {availability.reason ?? hint}
        </span>
      </span>
    </DropdownMenuItem>
  );
}

/**
 * The "▾" half of the capture split button (in the 72 px rail a secondary
 * chevron strip attached under "Speichern"): opens the menu with "Volle
 * Auflösung (langsam)…" and "Bildschirmfoto des Oszilloskops". Disabled
 * entries show their reason instead of the hint.
 *
 * @param props - See {@link CaptureMenuProps}
 * @returns The menu trigger and content
 */
export function CaptureMenu({
  layout,
  fullResolution,
  screenshot,
  disabled,
  onFullResolution,
  onScreenshot,
}: CaptureMenuProps) {
  if (!fullResolution.visible && !screenshot.visible) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={
            layout === "rail" || layout === "icon" ? "secondary" : "primary"
          }
          disabled={disabled}
          aria-label={t.more}
          data-testid="capture-menu-trigger"
          className={cn(TRIGGER_CLASS[layout])}
        >
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={layout === "rail" || layout === "icon" ? "right" : "bottom"}
        align={layout === "rail" || layout === "icon" ? "start" : "end"}
        className="w-72"
      >
        {fullResolution.visible && (
          <MenuEntry
            testId="menu-full-resolution"
            icon={<Database className="size-4" aria-hidden />}
            label={t.fullResolution}
            hint={withShortcut(t.fullResolutionHint, "fullResolution")}
            availability={fullResolution}
            onSelect={onFullResolution}
          />
        )}
        {screenshot.visible && (
          <MenuEntry
            testId="menu-screenshot"
            icon={<Monitor className="size-4" aria-hidden />}
            label={t.screenshot}
            hint={t.screenshotHint}
            availability={screenshot}
            onSelect={onScreenshot}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
