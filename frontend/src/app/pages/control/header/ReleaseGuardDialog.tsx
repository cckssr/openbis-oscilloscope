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

const t = de.control.page.release;

export interface ReleaseGuardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Captures not yet uploaded. */
  notUploaded: number;
  /** "Jetzt hochladen": go to the archive without releasing. */
  onUpload: () => void;
  /** "Trotzdem freigeben". */
  onReleaseAnyway: () => void;
}

/**
 * Confirmation before releasing the device while captures are not uploaded
 * (review §2.3 P1): Jetzt hochladen / Trotzdem freigeben / Abbrechen.
 *
 * @param props - See {@link ReleaseGuardDialogProps}
 * @returns The alert dialog
 */
export function ReleaseGuardDialog({
  open,
  onOpenChange,
  notUploaded,
  onUpload,
  onReleaseAnyway,
}: ReleaseGuardDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.title}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="block font-medium text-(--lab-text-primary)">{t.description(notUploaded)}</span>
            <span className="mt-1 block">{t.hint}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: "secondary" })} onClick={onReleaseAnyway}>
            {t.anyway}
          </AlertDialogAction>
          <AlertDialogAction onClick={onUpload}>{t.upload}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
