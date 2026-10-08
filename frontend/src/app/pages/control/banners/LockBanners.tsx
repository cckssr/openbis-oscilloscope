import { CircleAlert, MonitorSmartphone } from "lucide-react";
import { de } from "../../../../i18n/de";
import { Button } from "../../../components/ui/button";
import { useDeviceSessionSelector } from "../../../state/deviceSession";
import { useDeviceActions } from "../actions/session";
import { Banner } from "./Banner";

const t = de.control.page.banners;

/**
 * Blocking banner when the heartbeat failed or the lock expired. All loops
 * are stopped by the store; "Erneut übernehmen" takes the device again.
 *
 * @param props.deviceId - The device
 * @returns The banner, or null
 */
export function LockLostBanner({ deviceId }: { deviceId: string }) {
  const actions = useDeviceActions(deviceId);
  // null = not lost; the string is the store's message ("" when it gave none).
  const message = useDeviceSessionSelector(deviceId, (s) => (s.lock.status === "lost" ? (s.lock.error ?? "") : null));
  if (message === null) return null;
  return (
    <Banner
      tone="danger"
      role="alert"
      icon={CircleAlert}
      testId="lock-lost-banner"
      title={t.lostTitle}
      action={<Button variant="primary" onClick={() => void actions.takeControl()}>{t.retake}</Button>}
    >
      {message || t.lostText}
    </Banner>
  );
}

/**
 * Banner for a second tab of the same browser: this tab shows the device but
 * another one controls it.
 *
 * @param props.deviceId - The device
 * @returns The banner, or null
 */
export function PassiveTabBanner({ deviceId }: { deviceId: string }) {
  const actions = useDeviceActions(deviceId);
  const passive = useDeviceSessionSelector(deviceId, (s) => s.lock.status === "passive");
  if (!passive) return null;
  return (
    <Banner
      tone="info"
      icon={MonitorSmartphone}
      testId="passive-banner"
      action={<Button variant="primary" onClick={() => void actions.takeControl()}>{t.passiveAction}</Button>}
    >
      {t.passiveText}
    </Banner>
  );
}
