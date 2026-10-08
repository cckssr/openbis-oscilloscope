import { CircleCheck, HardDrive, ListChecks } from "lucide-react";
import { de } from "../../../i18n/de";
import type { CaptureStatus } from "./groupArtifacts";

const STYLES: Record<CaptureStatus, { cls: string; Icon: typeof HardDrive }> = {
  local: {
    cls: "border-(--lab-border) text-(--lab-text-secondary)",
    Icon: HardDrive,
  },
  selected: {
    cls: "border-(--lab-accent) bg-(--lab-accent)/10 text-(--lab-accent)",
    Icon: ListChecks,
  },
  uploaded: {
    cls: "border-(--lab-success) bg-(--lab-success)/10 text-(--lab-success)",
    Icon: CircleCheck,
  },
};

/**
 * Upload status of a capture as icon + text (colour is never the only signal).
 * @param props.status - "local", "selected" or "uploaded"
 * @returns The status chip
 */
export function StatusChip({ status }: { status: CaptureStatus }) {
  const { cls, Icon } = STYLES[status];
  return (
    <span
      data-status={status}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="text-left leading-tight">{de.archive.status[status]}</span>
    </span>
  );
}
