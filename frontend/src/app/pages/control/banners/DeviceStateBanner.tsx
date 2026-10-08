import { OctagonAlert, WifiOff } from "lucide-react";
import { de } from "../../../../i18n/de";
import { useDeviceSessionSelector } from "../../../state/deviceSession";
import { Banner } from "./Banner";

const t = de.control.page.banners;

/**
 * Notice when the device is OFFLINE or in ERROR, with the driver's `last_error`.
 * Not shown while this tab controls the device (the lock-lost banner covers that).
 *
 * @param props.deviceId - The device
 * @returns The banner, or null
 */
export function DeviceStateBanner({ deviceId }: { deviceId: string }) {
  const info = useDeviceSessionSelector(deviceId, (s) =>
    s.lock.status === "held" || !s.device || (s.device.state !== "OFFLINE" && s.device.state !== "ERROR")
      ? null
      : `${s.device.state}|${s.device.last_error ?? ""}`,
  );
  if (!info) return null;
  const [state, lastError] = [info.slice(0, info.indexOf("|")), info.slice(info.indexOf("|") + 1)];
  const offline = state === "OFFLINE";
  return (
    <Banner
      tone={offline ? "warning" : "danger"}
      icon={offline ? WifiOff : OctagonAlert}
      role={offline ? "status" : "alert"}
      testId="device-state-banner"
      title={offline ? t.offline : t.error}
    >
      {lastError ? t.lastError(lastError) : null}
    </Banner>
  );
}
