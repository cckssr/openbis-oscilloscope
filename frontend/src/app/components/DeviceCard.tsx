import type { Device } from "../../api/types";
import { de } from "../../i18n/de";
import { StatusBadge } from "./StatusBadge";
import { Button } from "./ui/button";
import { formatLockSince } from "../pages/devices/lockSince";

const t = de.devices.card;

export interface DeviceCardProps {
  device: Device;
  /** Navigates to the control page; only called when the device can be opened/resumed. */
  onOpen: (device: Device) => void;
}

/** What the card's button does and why, derived from state and lock. */
interface CardAction {
  label: string;
  /** Null when enabled. */
  disabledReason: string | null;
  variant: "primary" | "outline";
}

function actionFor(device: Device): CardAction {
  if (device.state === "OFFLINE") {
    return { label: t.offline, disabledReason: t.offlineReason, variant: "outline" };
  }
  if (device.state === "ERROR") {
    return { label: t.unavailable, disabledReason: t.errorHint, variant: "outline" };
  }
  if (device.lock?.is_mine) return { label: t.resume, disabledReason: null, variant: "primary" };
  if (device.lock) {
    return { label: t.busy, disabledReason: lockedByText(device), variant: "outline" };
  }
  return { label: t.open, disabledReason: null, variant: "outline" };
}

function lockedByText(device: Device): string {
  const since = device.lock ? formatLockSince(device.lock.acquired_at) : "";
  return device.lock?.owner_user
    ? t.lockedBy(device.lock.owner_user, since)
    : t.lockedByUnknown(since);
}

/**
 * Card for one oscilloscope: label, status chip, address and one action button
 * ("Öffnen" / "Fortsetzen" / disabled "Belegt" / "Offline" / "Nicht verfügbar").
 * Every reason a device cannot be opened is printed on the card, so it also
 * works on touch screens.
 *
 * @param props - See {@link DeviceCardProps}
 * @returns The card
 */
export function DeviceCard({ device, onOpen }: DeviceCardProps) {
  const action = actionFor(device);
  const mine = device.lock?.is_mine ?? false;
  const locked = device.lock !== null;

  return (
    <div className="flex flex-col gap-3 rounded border-2 border-(--lab-border) bg-white p-4" data-device-id={device.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-words text-base font-medium text-(--lab-text-primary)">{device.label}</h2>
          <p className="help-text mt-0.5">ID: {device.id}</p>
        </div>
        <StatusBadge
          status={device.state === "ONLINE" && locked ? "LOCKED" : device.state}
          isMine={mine}
        />
      </div>

      <p className="font-mono text-xs text-(--lab-text-secondary)">{device.ip}</p>

      {device.state === "ERROR" && (
        <div className="rounded border border-(--lab-danger) bg-white p-2 text-xs">
          <p className="break-words font-medium text-(--lab-danger)">
            {device.last_error || t.errorUnknown}
          </p>
          <p className="mt-1 text-(--lab-text-secondary)">{t.errorHint}</p>
        </div>
      )}
      {device.state === "OFFLINE" && <p className="help-text">{t.offlineReason}</p>}
      {device.state !== "ERROR" && device.state !== "OFFLINE" && locked && (
        <p className="help-text">{mine ? t.lockedByMe : lockedByText(device)}</p>
      )}

      <Button
        className="mt-auto w-full"
        variant={action.variant}
        disabled={action.disabledReason !== null}
        title={action.disabledReason ?? undefined}
        onClick={() => onOpen(device)}
      >
        {action.label}
      </Button>
    </div>
  );
}
