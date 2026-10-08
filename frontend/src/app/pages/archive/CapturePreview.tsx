import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { ExportMenu } from "../../components/plot/ExportMenu";
import { MeasurementTable } from "../../components/plot/MeasurementTable";
import { WaveformPlot } from "../../components/plot/WaveformPlot";
import { de } from "../../../i18n/de";
import { formatDate, formatTime } from "../../../lib/units";
import { ChannelChips } from "./ChannelChips";
import type { Capture } from "./groupArtifacts";
import { StatusChip } from "./StatusChip";
import { usePreviewData } from "./usePreviewData";

const t = de.archive.preview;

interface CapturePreviewProps {
  capture: Capture;
  /** 0-based position in the timeline and total number of captures. */
  index: number;
  total: number;
  token: string;
  sessionId: string;
  screenshotUrl?: string;
  /** File-name stem for exports, e.g. "messdaten_scope-01". */
  baseName: string;
  onPrev: () => void;
  onNext: () => void;
  /** Shows the close button (split view; the Dialog has its own). */
  onClose?: () => void;
  className?: string;
}

/**
 * Preview of one capture: plot, basic measurements, note and export menu — or
 * the screenshot image. Used inside the split view and the narrow-screen Dialog.
 * @param props - See {@link CapturePreviewProps}
 * @returns The preview body
 */
export function CapturePreview({
  capture,
  index,
  total,
  token,
  sessionId,
  screenshotUrl,
  baseName,
  onPrev,
  onNext,
  onClose,
  className = "",
}: CapturePreviewProps) {
  const data = usePreviewData(token, sessionId, capture);
  const [plotEl, setPlotEl] = useState<HTMLElement | null>(null);
  const time = formatTime(capture.createdAt);

  return (
    <div className={`flex min-h-0 flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-(--lab-text-primary)">
            {formatDate(capture.createdAt)} ·{" "}
            <span className="font-mono tabular-nums">{time}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ChannelChips capture={capture} thumbnailUrl={screenshotUrl} />
            <StatusChip status={capture.status} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            onClick={onPrev}
            disabled={index <= 0}
            aria-label={t.prev}
            title={t.prev}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-14 text-center text-xs text-(--lab-text-secondary) tabular-nums">
            {t.position(index + 1, total)}
          </span>
          <Button
            variant="secondary"
            size="icon"
            onClick={onNext}
            disabled={index >= total - 1}
            aria-label={t.next}
            title={t.next}
          >
            <ChevronRight />
          </Button>
          <ExportMenu
            input={{
              traces: data.traces,
              plotElement: plotEl,
              token,
              sessionId,
              artifactIds: capture.artifactIds,
              baseName: `${baseName}_${time.replaceAll(":", "")}`,
            }}
          />
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t.close}
              title={t.close}
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      <div className="rounded border-2 border-(--lab-border) bg-(--lab-panel) px-3 py-2 text-sm">
        {capture.annotation ? (
          <span className="text-(--lab-text-primary)">
            {capture.annotation}
          </span>
        ) : (
          <span className="text-(--lab-text-secondary) italic">{t.noNote}</span>
        )}
      </div>

      {capture.kind === "screenshot" ? (
        <div className="flex min-h-48 flex-1 items-center justify-center overflow-auto rounded border-2 border-(--lab-border) bg-white p-2">
          {screenshotUrl ? (
            <img
              src={screenshotUrl}
              alt={t.screenshotAlt}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <LoaderCircle
              className="size-6 animate-spin text-(--lab-text-secondary)"
              aria-label="…"
            />
          )}
        </div>
      ) : data.status === "error" ? (
        <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 rounded border-2 border-(--lab-danger) p-4 text-center">
          <p className="text-sm text-(--lab-danger)">{t.loadError}</p>
          <Button variant="secondary" size="sm" onClick={data.reload}>
            <RefreshCw /> {t.retry}
          </Button>
        </div>
      ) : data.status === "loading" ? (
        <Skeleton className="min-h-64 flex-1" />
      ) : (
        <div
          ref={setPlotEl}
          className="min-h-72 flex-1 rounded border-2 border-(--lab-border) bg-white"
        >
          <WaveformPlot
            traces={data.traces}
            yMode="volts"
            viewKey={capture.id}
            showReadouts={false}
            emptyMessage={t.noData}
            className="h-full min-h-72"
          />
        </div>
      )}

      {capture.kind === "trace" &&
        data.status === "ready" &&
        data.traces.length > 0 && (
          <MeasurementTable traces={data.traces} level="basic" />
        )}
      <p className="help-text">{t.keyHint}</p>
    </div>
  );
}
