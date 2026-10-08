import { useRef } from "react";
import { de } from "../../../../i18n/de";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { buttonVariants } from "../../../components/ui/button";
import { useCaptureRunning, useLeaveGuard } from "./useLeaveGuard";

const t = de.control.page.leave;

/**
 * Confirmation before navigating away from the control page while a
 * full-resolution read or a series is running: "Eine Aufnahme läuft noch.
 * Seite trotzdem verlassen?" with Bleiben (default) / Verlassen. Also arms the
 * browser's tab-close prompt (see {@link useLeaveGuard}).
 *
 * @param props.deviceId - The device
 * @returns The alert dialog (closed unless a navigation was blocked)
 */
export function LeaveGuardDialog({ deviceId }: { deviceId: string }) {
  const running = useCaptureRunning(deviceId);
  const blocker = useLeaveGuard(running);
  const blocked = blocker.state === "blocked";
  // "Verlassen" also closes the alert dialog; that close must not reset the blocker again.
  const leaving = useRef(false);

  return (
    <AlertDialog
      open={blocked}
      onOpenChange={(open) => {
        if (open || !blocked) return;
        if (leaving.current) leaving.current = false;
        else blocker.reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.title}</AlertDialogTitle>
          <AlertDialogDescription>{t.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.stay}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "secondary" })}
            onClick={() => {
              if (!blocked) return;
              leaving.current = true;
              blocker.proceed();
            }}
          >
            {t.leave}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
