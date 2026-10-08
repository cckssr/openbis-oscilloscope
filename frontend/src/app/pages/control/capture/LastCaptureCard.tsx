import { de } from "../../../../i18n/de";
import { channelColor, channelLabel } from "../../../../lib/channels";
import { formatTime } from "../../../../lib/units";
import { EmptyState } from "../../../components/common";
import { Badge } from "../../../components/ui/badge";
import { cn } from "../../../components/ui/utils";
import { useDeviceSessionSelector } from "../actions/session";
import { CaptureNote } from "./CaptureNote";

const t = de.control.actions.lastCapture;

export interface LastCaptureCardProps {
  deviceId: string;
  /** card = framed card (default), compact = single dense block for narrow layouts. */
  layout?: "card" | "compact";
}

interface Slice {
  acquisitionId: string;
  number: number;
  createdAt: string;
  fullResolution: boolean;
  channels: number[];
  note: string;
  flagged: boolean;
  fresh: boolean;
  held: boolean;
}

const sameSlice = (a: Slice | null, b: Slice | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.acquisitionId === b.acquisitionId &&
    a.number === b.number &&
    a.fullResolution === b.fullResolution &&
    a.note === b.note &&
    a.flagged === b.flagged &&
    a.fresh === b.fresh &&
    a.held === b.held &&
    a.channels.join() === b.channels.join());

/**
 * "Letzte Aufnahme": number, time, channel chips, "Volle Auflösung" badge,
 * the note field and the upload checkbox. Subscribes only to the last
 * capture, never to live frames, so the note is never re-rendered or cleared
 * per frame. Read-only while this tab does not control the device.
 *
 * @param props - See {@link LastCaptureCardProps}
 * @returns The card, or an empty state before the first capture
 */
export function LastCaptureCard({ deviceId, layout = "card" }: LastCaptureCardProps) {
  const capture = useDeviceSessionSelector(
    deviceId,
    (s): Slice | null =>
      s.lastCapture
        ? {
            acquisitionId: s.lastCapture.acquisitionId,
            number: s.lastCapture.number,
            createdAt: s.lastCapture.createdAt,
            fullResolution: s.lastCapture.fullResolution,
            channels: s.lastCapture.frame.traces
              .filter((tr) => tr.kind === "channel" && tr.channel !== undefined)
              .map((tr) => tr.channel as number),
            note: s.lastCapture.note,
            flagged: s.lastCapture.flagged,
            fresh: s.lastCapture.fresh === true,
            held: s.lock.status === "held",
          }
        : null,
    sameSlice,
  );
  const compact = layout === "compact";

  return (
    <section
      aria-label={t.title}
      data-testid="last-capture"
      className={cn(
        "rounded-lg border border-(--lab-border) bg-white",
        compact ? "p-2" : "p-3",
      )}
    >
      <h3 className="text-sm font-medium text-(--lab-text-primary)">{t.title}</h3>
      {!capture ? (
        <EmptyState title={t.empty} className={compact ? "py-3" : "py-6"} />
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium" data-testid="capture-summary">
              {t.summary(capture.number, formatTime(capture.createdAt))}
            </span>
            <span className="inline-flex flex-wrap gap-1">
              {capture.channels.map((ch) => (
                <span
                  key={ch}
                  className="inline-flex items-center gap-1 rounded border border-(--lab-border) px-1.5 py-0.5 text-xs font-medium"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: channelColor(ch) }}
                    aria-hidden
                  />
                  {channelLabel(ch)}
                </span>
              ))}
            </span>
            {capture.fullResolution && <Badge variant="secondary">{t.fullResolutionBadge}</Badge>}
          </div>
          <CaptureNote
            key={capture.acquisitionId}
            deviceId={deviceId}
            acquisitionId={capture.acquisitionId}
            focusOnMount={capture.fresh}
            note={capture.note}
            flagged={capture.flagged}
            canEdit={capture.held}
            compact={compact}
          />
        </div>
      )}
    </section>
  );
}
