import { Fragment } from "react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { de } from "../../../i18n/de";
import { selectableCaptures, selectionState, type Capture, type Timeline } from "./groupArtifacts";
import { CaptureRow, DayRow, SeriesRow } from "./ArchiveRows";
import { UploadCheckbox } from "./UploadCheckbox";

const t = de.archive.table;

interface ArchiveTableProps {
  timeline: Timeline;
  /** Capture currently shown in the preview, highlighted in the list. */
  activeId: string | null;
  /** Run ids of expanded series. */
  expandedRuns: Set<string>;
  screenshotUrls: Record<string, string>;
  onToggleRun: (runId: string) => void;
  onPreview: (id: string) => void;
  onToggleUpload: (captures: Capture[], wanted: boolean) => void;
  onSaveNote: (capture: Capture, text: string) => void;
}

/**
 * The archive timeline as a real table: Hochladen · Zeit · Kanäle · Notiz · Status · Aktionen.
 * @param props - See {@link ArchiveTableProps}
 * @returns The table with day headers, series groups and capture rows
 */
export function ArchiveTable({
  timeline,
  activeId,
  expandedRuns,
  screenshotUrls,
  onToggleRun,
  onPreview,
  onToggleUpload,
  onSaveNote,
}: ArchiveTableProps) {
  const rowFor = (capture: Capture, nested = false) => (
    <CaptureRow
      key={capture.id}
      capture={capture}
      nested={nested}
      isActive={capture.id === activeId}
      thumbnailUrl={screenshotUrls[capture.artifactIds[0]]}
      onPreview={onPreview}
      onToggleUpload={onToggleUpload}
      onSaveNote={onSaveNote}
    />
  );

  return (
    <Table className="table-fixed">
      <colgroup>
        <col className="w-[84px] coarse:w-[96px]" />
        <col className="w-[100px]" />
        <col className="w-[148px] xl:w-[224px]" />
        <col />
        <col className="w-[140px] xl:w-[150px]" />
        <col className="w-[96px] coarse:w-[112px]" />
      </colgroup>
      <TableHeader className="sticky top-0 z-10 bg-white shadow-[0_1px_0_var(--lab-border)]">
        <TableRow className="hover:bg-transparent">
          <TableHead className="px-1 text-center">
            <div className="flex flex-col items-center">
              <span className="text-xs font-medium text-(--lab-text-secondary)">{t.upload}</span>
              <UploadCheckbox
                state={selectionState(timeline.captures)}
                ariaLabel={de.archive.select.allAria}
                disabledReason={t.uploadedReason}
                onChange={(wanted) => onToggleUpload(selectableCaptures(timeline.captures), wanted)}
              />
            </div>
          </TableHead>
          <TableHead>{t.time}</TableHead>
          <TableHead>{t.channels}</TableHead>
          <TableHead>{t.note}</TableHead>
          <TableHead>{t.status}</TableHead>
          <TableHead className="text-right">{t.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {timeline.days.map((day) => (
          <Fragment key={day.dayKey}>
            <DayRow date={day.date} />
            {day.entries.map((entry) =>
              entry.type === "capture" ? (
                rowFor(entry.capture)
              ) : (
                <Fragment key={entry.runId}>
                  <SeriesRow
                    series={entry}
                    expanded={expandedRuns.has(entry.runId)}
                    onToggleExpanded={() => onToggleRun(entry.runId)}
                    onToggleUpload={onToggleUpload}
                  />
                  {expandedRuns.has(entry.runId) && entry.captures.map((c) => rowFor(c, true))}
                </Fragment>
              ),
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
