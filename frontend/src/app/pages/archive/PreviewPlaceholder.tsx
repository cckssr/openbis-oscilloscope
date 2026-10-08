import { Eye } from "lucide-react";
import { EmptyState } from "../../components/common";
import { de } from "../../../i18n/de";

/** Right-hand side of the split view while no capture is selected. */
export function PreviewPlaceholder() {
  return (
    <EmptyState
      icon={<Eye />}
      title={de.archive.preview.title}
      description={de.archive.preview.placeholder}
      className="h-full"
    />
  );
}
