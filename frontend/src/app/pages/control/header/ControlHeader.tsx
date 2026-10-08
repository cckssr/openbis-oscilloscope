import { de } from "../../../../i18n/de";
import { PageHeader } from "../../../components/common";
import { StatusBadge } from "../../../components/StatusBadge";
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
}

/**
 * Header slot: back to the device list, device name and id, status badge and
 * line ("Du steuerst dieses Gerät · aktiv seit 14:02"), Einfach/Erweitert
 * toggle, "Messdaten (n)" link and the take/release button.
 *
 * @param props - See {@link ControlHeaderProps}
 * @returns The page header
 */
export function ControlHeader({ deviceId, level, onLevelChange }: ControlHeaderProps) {
  const model = useHeaderModel(deviceId);
  const { device, lockStatus } = model;
  const mine = lockStatus === "held" || lockStatus === "passive" || lockStatus === "releasing" || !!device?.lock?.is_mine;
  const line = statusLine(model);
  // device.state is fetched before the lock is taken, so derive LOCKED from our own lock.
  const badgeState = mine && device?.state === "ONLINE" ? "LOCKED" : device?.state;

  return (
    <PageHeader
      backTo="/"
      backLabel={de.control.page.header.back}
      title={device?.label ?? deviceId}
      subtitle={
        <>
          <span className="font-mono">{deviceId}</span>
          {line && <> · <span aria-live="polite">{line}</span></>}
        </>
      }
      status={device && badgeState && <StatusBadge status={badgeState} isMine={mine} />}
      actions={
        <>
          <LevelToggle level={level} onChange={onLevelChange} />
          <ArchiveLink sessionId={model.archiveSessionId} count={model.total} />
          <OwnerButton deviceId={deviceId} model={model} />
        </>
      }
    />
  );
}

