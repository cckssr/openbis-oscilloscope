import { Clock } from "lucide-react";
import { Link } from "react-router";
import { de } from "../../../../i18n/de";
import { Button } from "../../../components/ui/button";
import { useAppConfig } from "../../../hooks/useAppConfig";
import { useNow } from "../status/useNow";
import { archivePath } from "../header";
import { useHeaderModel } from "../header/model";
import { Banner } from "./Banner";
import { eodMinutesLeft } from "./eodWarning";

const t = de.control.page.banners;

/**
 * Warns during the 10 minutes before the daily reset ("Um 23:59 werden alle
 * Geräte freigegeben – lade deine Aufnahmen vorher hoch."). Only shown to
 * users who control the device or still hold un-uploaded captures.
 *
 * @param props.deviceId - The device
 * @param props.now - Fixed time (tests); defaults to a ticking clock
 * @returns The banner, or null
 */
export function EodBanner({ deviceId, now }: { deviceId: string; now?: Date }) {
  const config = useAppConfig();
  const tick = useNow(30_000, now === undefined);
  const model = useHeaderModel(deviceId);
  const relevant = model.lockStatus === "held" || model.lockStatus === "passive" || model.notUploaded > 0;
  if (!config || !relevant) return null;
  const left = eodMinutesLeft(now ?? new Date(tick), config.eod_reset_time, config.eod_timezone);
  if (left === null) return null;
  return (
    <Banner
      tone="warning"
      icon={Clock}
      testId="eod-banner"
      action={
        <Button asChild size="sm" variant="secondary">
          <Link to={archivePath(model.archiveSessionId)}>{t.eodUpload}</Link>
        </Button>
      }
    >
      {t.eod(config.eod_reset_time)} ({t.eodIn(left)})
    </Banner>
  );
}
