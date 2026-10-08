/** Row components of the archive table: day header, series header, capture row. */
import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, Ellipsis, Eye, RotateCcw, Pencil } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { TableCell, TableRow } from "../../components/ui/table";
import { de } from "../../../i18n/de";
import { formatDate, formatTime } from "../../../lib/units";
import { ChannelChips } from "./ChannelChips";
import {
  countByStatus,
  selectableCaptures,
  selectionState,
  type Capture,
  type SeriesGroup,
} from "./groupArtifacts";
import { NoteCell } from "./NoteCell";
import { StatusChip } from "./StatusChip";
import { UploadCheckbox } from "./UploadCheckbox";

const t = de.archive;

/** Number of columns of the archive table (for colSpan of group rows). */
export const COLUMN_COUNT = 6;

/**
 * Date header, shown once per day.
 * @param props.date - ISO timestamp of any entry of that day
 * @returns A full-width table row
 */
export function DayRow({ date }: { date: string }) {
  return (
    <TableRow className="bg-(--lab-panel) hover:bg-(--lab-panel)">
      <TableCell
        colSpan={COLUMN_COUNT}
        className="py-1.5 text-xs font-semibold tracking-wide text-(--lab-text-secondary) uppercase"
      >
        {formatDate(date)}
      </TableCell>
    </TableRow>
  );
}

interface SeriesRowProps {
  series: SeriesGroup;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleUpload: (captures: Capture[], wanted: boolean) => void;
}

/**
 * Collapsible "Serie n" header with an aggregate upload checkbox.
 * @param props - See {@link SeriesRowProps}
 * @returns A table row
 */
export function SeriesRow({ series, expanded, onToggleExpanded, onToggleUpload }: SeriesRowProps) {
  const counts = countByStatus(series.captures);
  const oldest = series.captures[series.captures.length - 1];
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const start = formatTime(oldest.createdAt);
  const end = formatTime(series.captures[0].createdAt);
  const span = start === end ? start : `${start}–${end}`;
  return (
    <TableRow className="bg-(--lab-panel)/60">
      <TableCell className="text-center">
        <UploadCheckbox
          state={selectionState(series.captures)}
          ariaLabel={t.table.seriesUploadAria(series.number)}
          disabledReason={t.table.uploadedReason}
          onChange={(wanted) => onToggleUpload(selectableCaptures(series.captures), wanted)}
        />
      </TableCell>
      <TableCell colSpan={COLUMN_COUNT - 1} className="py-1">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={`${t.table.series(series.number)}: ${t.table.seriesToggle}`}
          className="flex min-h-9 w-full items-center gap-2 rounded text-left text-sm font-medium text-(--lab-text-primary) hover:text-(--lab-accent) coarse:min-h-11"
        >
          <Chevron className="size-4 shrink-0" aria-hidden />
          <span>{t.table.series(series.number)}</span>
          <span className="font-normal text-(--lab-text-secondary)">
            · {t.table.seriesCount(series.captures.length)} · {span}
            {counts.selected > 0 && ` · ${t.summary.selected(counts.selected)}`}
            {counts.uploaded > 0 && ` · ${t.summary.uploaded(counts.uploaded)}`}
          </span>
        </button>
      </TableCell>
    </TableRow>
  );
}

interface CaptureRowProps {
  capture: Capture;
  /** Indents the row below a series header. */
  nested?: boolean;
  isActive: boolean;
  thumbnailUrl?: string;
  onPreview: (id: string) => void;
  onToggleUpload: (captures: Capture[], wanted: boolean) => void;
  onSaveNote: (capture: Capture, text: string) => void;
}

/**
 * One capture: upload checkbox, time, channel chips, inline note, status chip, actions.
 * @param props - See {@link CaptureRowProps}
 * @returns A table row
 */
export function CaptureRow({
  capture,
  nested,
  isActive,
  thumbnailUrl,
  onPreview,
  onToggleUpload,
  onSaveNote,
}: CaptureRowProps) {
  const [editingNote, setEditingNote] = useState(false);
  const skipFocusRestore = useRef(false);
  const time = formatTime(capture.createdAt);
  const uploaded = capture.status === "uploaded";

  return (
    <TableRow
      data-capture-id={capture.id}
      data-state={isActive ? "selected" : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,input,label,a,[role=menuitem]")) return;
        onPreview(capture.id);
      }}
      className="cursor-pointer data-[state=selected]:bg-(--lab-accent)/10"
    >
      <TableCell className="text-center">
        <UploadCheckbox
          state={uploaded ? "disabled" : capture.status === "selected" ? "all" : "none"}
          ariaLabel={t.table.rowUploadAria(time)}
          disabledReason={t.table.uploadedReason}
          onChange={(wanted) => onToggleUpload([capture], wanted)}
        />
      </TableCell>
      <TableCell className={`font-mono text-sm tabular-nums ${nested ? "pl-6" : ""}`}>
        {time}
      </TableCell>
      <TableCell className="whitespace-normal">
        <ChannelChips capture={capture} thumbnailUrl={thumbnailUrl} />
      </TableCell>
      <TableCell className="max-w-0 whitespace-normal">
        <NoteCell
          value={capture.annotation}
          editable={capture.acquisitionId != null}
          onSave={(text) => onSaveNote(capture, text)}
          editing={editingNote}
          onEditingChange={setEditingNote}
        />
      </TableCell>
      <TableCell className="whitespace-normal">
        <StatusChip status={capture.status} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${t.actions.preview} ${time}`}
            title={t.actions.preview}
            onClick={() => onPreview(capture.id)}
          >
            <Eye />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t.actions.more} title={t.actions.more}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(e) => {
                // Let the note input keep the focus it just received.
                if (skipFocusRestore.current) e.preventDefault();
                skipFocusRestore.current = false;
              }}
            >
              <DropdownMenuItem onSelect={() => onPreview(capture.id)}>
                <Eye /> {t.actions.preview}
              </DropdownMenuItem>
              {capture.acquisitionId && (
                <DropdownMenuItem
                  onSelect={() => {
                    skipFocusRestore.current = true;
                    setEditingNote(true);
                  }}
                >
                  <Pencil /> {t.actions.editNote}
                </DropdownMenuItem>
              )}
              {uploaded && (
                <DropdownMenuItem onSelect={() => onToggleUpload([capture], true)}>
                  <RotateCcw /> {t.actions.reupload}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
