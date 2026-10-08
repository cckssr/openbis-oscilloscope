import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog";
import { de } from "../../../i18n/de";
import { CapturePreview } from "./CapturePreview";

type PreviewProps = Parameters<typeof CapturePreview>[0];

/**
 * Preview in a modal Dialog for screens narrower than the split-view breakpoint.
 * Escape and the close button dismiss it; focus is trapped while open.
 * @param props - Preview props plus the close handler
 * @returns The dialog
 */
export function PreviewDialog({
  onClose,
  ...preview
}: PreviewProps & { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[94dvh] min-h-[60dvh] flex-col gap-3 overflow-auto p-4 sm:max-w-4xl md:p-5">
        <DialogTitle className="sr-only">
          {de.archive.preview.title}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {de.archive.preview.keyHint}
        </DialogDescription>
        <CapturePreview {...preview} className="flex-1" />
      </DialogContent>
    </Dialog>
  );
}
