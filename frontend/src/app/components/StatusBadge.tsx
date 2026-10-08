import {
  CircleCheck,
  Loader,
  Lock,
  OctagonAlert,
  UserCheck,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import type { DeviceState } from "../../api/types";
import { cn } from "./ui/utils";
import { de } from "../../i18n/de";

type StatusKey = DeviceState | "LOCKED_MINE";

const STATUS: Record<StatusKey, { icon: LucideIcon; classes: string }> = {
  ONLINE: { icon: CircleCheck, classes: "border-(--lab-success) text-(--lab-success)" },
  LOCKED: { icon: Lock, classes: "border-(--lab-warning) text-(--lab-warning)" },
  LOCKED_MINE: { icon: UserCheck, classes: "border-(--lab-accent) text-(--lab-accent)" },
  BUSY: { icon: Loader, classes: "border-(--lab-warning) text-(--lab-warning)" },
  OFFLINE: { icon: WifiOff, classes: "border-(--lab-border) text-(--lab-text-secondary)" },
  ERROR: { icon: OctagonAlert, classes: "border-(--lab-danger) text-(--lab-danger)" },
};

export interface StatusBadgeProps {
  status: DeviceState;
  /** True when the user holds the lock: a LOCKED device then reads "Du steuerst" instead of "Belegt". */
  isMine?: boolean;
  className?: string;
}

/**
 * Device status chip. Always shows an icon plus a German label so colour is
 * never the only signal.
 *
 * @param props - See {@link StatusBadgeProps}
 * @returns The chip (`data-status` carries the raw device state)
 */
export function StatusBadge({ status, isMine = false, className }: StatusBadgeProps) {
  const key: StatusKey = status === "LOCKED" && isMine ? "LOCKED_MINE" : status;
  const { icon: Icon, classes } = STATUS[key];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border-2 bg-white px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        classes,
        className,
      )}
      data-status={status}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {de.common.status[key]}
    </span>
  );
}
