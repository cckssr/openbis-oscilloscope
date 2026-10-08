import { Image as ImageIcon } from "lucide-react";
import { de } from "../../../i18n/de";
import { channelColor, channelLabel } from "../../../lib/channels";
import type { Capture } from "./groupArtifacts";

/**
 * Coloured channel chips of a capture (colour + label), or a screenshot chip
 * with optional thumbnail.
 * @param props.capture - The capture to describe
 * @param props.thumbnailUrl - Object URL of the screenshot, if loaded
 * @returns The chips
 */
export function ChannelChips({
  capture,
  thumbnailUrl,
}: {
  capture: Capture;
  thumbnailUrl?: string;
}) {
  if (capture.kind === "screenshot") {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-(--lab-text-secondary)">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="h-7 w-10 rounded border border-(--lab-border) object-cover"
          />
        ) : (
          <ImageIcon className="size-4" aria-hidden />
        )}
        {de.archive.table.screenshot}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-0.5">
      {capture.channels.map((ch) => (
        <span
          key={ch}
          className="inline-flex items-center gap-1 rounded border border-(--lab-border) bg-white px-1 py-0.5 text-xs font-medium text-(--lab-text-primary)"
        >
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: channelColor(ch) }}
            aria-hidden
          />
          {channelLabel(ch)}
        </span>
      ))}
    </span>
  );
}
