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

const t = de.control.page.otherLock;

export interface OtherLockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names of the devices this user already holds. */
  deviceNames: string[];
  /** "Anderes freigeben und übernehmen". */
  onSwitch: () => void;
  /** "Beide behalten". */
  onKeepBoth: () => void;
}

/**
 * Confirmation before taking a second device: Abbrechen / Beide behalten /
 * Anderes freigeben und übernehmen.
 *
 * @param props - See {@link OtherLockDialogProps}
 * @returns The alert dialog
 */
export function OtherLockDialog({ open, onOpenChange, deviceNames, onSwitch, onKeepBoth }: OtherLockDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.title}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="block font-medium text-(--lab-text-primary)">{t.description(deviceNames)}</span>
            <span className="mt-1 block">{t.hint}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: "secondary" })} onClick={onKeepBoth}>
            {t.both}
          </AlertDialogAction>
          <AlertDialogAction onClick={onSwitch}>{t.switch(deviceNames.length)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
