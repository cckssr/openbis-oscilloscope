import { useState } from "react";
import { LoaderCircle, LogIn, LogOut } from "lucide-react";
import { useNavigate } from "react-router";
import { de } from "../../../../i18n/de";
import { DisabledReason } from "../../../components/common";
import { Button } from "../../../components/ui/button";
import { useDeviceActions } from "../actions/session";
import { archivePath, type HeaderModel } from "./model";
import { OtherLockDialog } from "./OtherLockDialog";
import { ReleaseGuardDialog } from "./ReleaseGuardDialog";
import { useTakeControl } from "./useTakeControl";

const t = de.control.page.header;

/**
 * Why the device cannot be taken right now, or null.
 * @param m - Header slice
 * @returns German reason, or null when "Gerät übernehmen" is possible
 */
export function takeBlockedReason(m: HeaderModel): string | null {
  const d = m.device;
  if (!d) return de.control.page.loading;
  if (
    m.lockStatus === "held" ||
    m.lockStatus === "passive" ||
    m.lockStatus === "lost"
  )
    return null;
  if (d.state === "OFFLINE" || d.state === "ERROR") return t.takeDisabledBusy;
  if (d.lock && !d.lock.is_mine) return t.lockedBy(d.lock.owner_user);
  return null;
}

/**
 * "Gerät übernehmen" (primary) while not in control (asks first when the user
 * already holds another device, see `useTakeControl`), "Gerät freigeben"
 * (secondary) while in control. Releasing with un-uploaded captures asks first
 * (`ReleaseGuardDialog`); the plot stays afterwards.
 *
 * @param props.deviceId - The device
 * @param props.model - Header slice
 * @returns The button with its guard dialog
 */
export function OwnerButton({
  deviceId,
  model,
}: {
  deviceId: string;
  model: HeaderModel;
}) {
  const actions = useDeviceActions(deviceId);
  const navigate = useNavigate();
  const [guardOpen, setGuardOpen] = useState(false);
  const take = useTakeControl(deviceId);
  const { lockStatus } = model;

  if (lockStatus === "held" || lockStatus === "releasing") {
    const releasing = lockStatus === "releasing";
    const reason = releasing
      ? null
      : model.busy
        ? de.control.session.lock.releaseBusy
        : null;
    return (
      <>
        <DisabledReason reason={reason}>
          <Button
            variant="secondary"
            disabled={releasing || !!reason}
            onClick={() =>
              model.notUploaded > 0
                ? setGuardOpen(true)
                : void actions.release()
            }
          >
            {releasing ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <LogOut aria-hidden />
            )}
            {releasing ? t.releasing : t.release}
          </Button>
        </DisabledReason>
        <ReleaseGuardDialog
          open={guardOpen}
          onOpenChange={setGuardOpen}
          notUploaded={model.notUploaded}
          onUpload={() => navigate(archivePath(model.archiveSessionId))}
          onReleaseAnyway={() => void actions.release()}
        />
      </>
    );
  }

  const taking = lockStatus === "acquiring" || take.checking;
  const reason = taking ? null : takeBlockedReason(model);
  return (
    <>
      <DisabledReason reason={reason}>
        <Button
          variant="primary"
          disabled={taking || !!reason}
          // Another tab of this device already holds the lock: nothing new gets locked, so no question.
          onClick={() =>
            lockStatus === "passive"
              ? void actions.takeControl()
              : take.request()
          }
        >
          {taking ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <LogIn aria-hidden />
          )}
          {taking ? t.taking : lockStatus === "lost" ? t.retake : t.take}
        </Button>
      </DisabledReason>
      <OtherLockDialog {...take.dialog} />
    </>
  );
}
