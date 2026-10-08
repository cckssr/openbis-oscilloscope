import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { de } from "../../../../i18n/de";
import { StatusBadge } from "../../../components/StatusBadge";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../components/ui/utils";
import type { ControlLevel } from "../../../controls";
import { ArchiveLink } from "./ArchiveLink";
import { LevelToggle } from "./LevelToggle";
import { useHeaderModel } from "./model";
import { OwnerButton } from "./OwnerButton";
import { statusLine } from "./statusLine";

export interface ControlHeaderProps {
  deviceId: string;
  level: ControlLevel;
  onLevelChange: (level: ControlLevel) => void;
  /**
   * Tablet mode: a single slim row (back, title, badge, Messdaten, owner button)
   * that never wraps. The level toggle is then rendered elsewhere (stepper row).
   */
  compact?: boolean;
}

/**
 * Header slot: back to the device list, device name and id, status badge and
 * line ("Du steuerst dieses Gerät · aktiv seit 14:02"), Einfach/Erweitert
 * toggle (not in `compact` mode), "Messdaten (n)" link and the take/release
 * button. In `compact` mode (tablets) everything sits in one non-wrapping row
 * of ~56 px so the plot keeps the height.
 *
 * @param props - See {@link ControlHeaderProps}
 * @returns The page header
 */
export function ControlHeader({
  deviceId,
  level,
  onLevelChange,
  compact = false,
}: ControlHeaderProps) {
  const model = useHeaderModel(deviceId);
  const { device, lockStatus } = model;
  const mine =
    lockStatus === "held" ||
    lockStatus === "passive" ||
    lockStatus === "releasing" ||
    !!device?.lock?.is_mine;
  const line = statusLine(model);
  // device.state is fetched before the lock is taken, so derive LOCKED from our own lock.
  const badgeState =
    mine && device?.state === "ONLINE" ? "LOCKED" : device?.state;

  const title = device?.label ?? deviceId;

  return (
    <header
      className={cn(
        "flex items-center gap-x-3 border-b-2 border-(--lab-border) bg-white",
        compact ? "px-3 py-2" : "justify-between gap-x-4 px-6 py-3",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          asChild
          variant="secondary"
          size="icon"
          aria-label={de.control.page.header.back}
          title={de.control.page.header.back}
        >
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1
            className={cn(
              "truncate font-semibold text-(--lab-text-primary)",
              compact ? "text-lg leading-tight" : "text-xl",
            )}
            title={String(title)}
          >
            {title}
          </h1>
          <p className="help-text truncate">
            <span className="font-mono">{deviceId}</span>
            {line && (
              <>
                {" "}
                · <span aria-live="polite">{line}</span>
              </>
            )}
          </p>
        </div>
        {device && badgeState && (
          <StatusBadge status={badgeState} isMine={mine} />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!compact && <LevelToggle level={level} onChange={onLevelChange} />}
        <ArchiveLink sessionId={model.archiveSessionId} count={model.total} />
        <OwnerButton deviceId={deviceId} model={model} />
      </div>
    </header>
  );
}
