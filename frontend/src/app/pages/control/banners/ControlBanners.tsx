import { DeviceStateBanner } from "./DeviceStateBanner";
import { EodBanner } from "./EodBanner";
import { LockLostBanner, PassiveTabBanner } from "./LockBanners";

/**
 * Banners slot: lock lost, second tab, device offline/error and the
 * end-of-day warning, stacked. Renders nothing when none applies.
 *
 * @param props.deviceId - The device
 * @returns The stacked banners
 */
export function ControlBanners({ deviceId }: { deviceId: string }) {
  return (
    <>
      <LockLostBanner deviceId={deviceId} />
      <PassiveTabBanner deviceId={deviceId} />
      <DeviceStateBanner deviceId={deviceId} />
      <EodBanner deviceId={deviceId} />
    </>
  );
}
