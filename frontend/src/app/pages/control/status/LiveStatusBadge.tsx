import { de } from "../../../../i18n/de";
import { cn } from "../../../components/ui/utils";
import { useDeviceSessionSelector } from "../actions/session";
import { formatAge, STALE_AFTER_MS } from "./age";
import { useNow } from "./useNow";

const t = de.control.actions.liveBadge;

export interface LiveStatusBadgeProps {
  deviceId: string;
}

interface LiveSlice {
  status: "off" | "starting" | "on" | "paused";
  lastFrameAt?: number;
}

const sameSlice = (a: LiveSlice, b: LiveSlice) =>
  a.status === b.status && a.lastFrameAt === b.lastFrameAt;

/**
 * Pulsing "LIVE" badge with the age of the newest frame ("aktualisiert vor
 * 0,8 s"). Turns amber "veraltet" when the frame is older than 3 s, shows
 * "pausiert" while paused and renders nothing when live is off. The age is
 * re-rendered on a local 250 ms timer.
 *
 * @param props - See {@link LiveStatusBadgeProps}
 * @returns The badge, or null when live is off
 */
export function LiveStatusBadge({ deviceId }: LiveStatusBadgeProps) {
  const live = useDeviceSessionSelector(
    deviceId,
    (s): LiveSlice => ({ status: s.live.status, lastFrameAt: s.live.lastFrameAt }),
    sameSlice,
  );
  const now = useNow(250, live.status === "on");
  if (live.status === "off") return null;

  if (live.status === "paused" || live.status === "starting") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-(--lab-border) bg-(--lab-panel) px-2.5 py-1 text-xs font-medium text-(--lab-text-secondary)"
        data-testid="live-badge"
        data-state={live.status}
      >
        <span className="size-2 rounded-full bg-(--lab-text-secondary)" aria-hidden />
        {live.status === "paused" ? t.paused : `${t.live} ${t.starting}`}
      </span>
    );
  }

  const age = live.lastFrameAt === undefined ? null : now - live.lastFrameAt;
  const stale = age !== null && age > STALE_AFTER_MS;
  return (
    <span
      role="status"
      data-testid="live-badge"
      data-state={stale ? "stale" : "on"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        stale
          ? "border-(--lab-warning) bg-amber-50 text-amber-800"
          : "border-(--lab-success) bg-emerald-50 text-emerald-800",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          stale ? "bg-(--lab-warning)" : "animate-pulse bg-(--lab-success)",
        )}
        aria-hidden
      />
      <span className="font-semibold tracking-wide">{stale ? t.stale : t.live}</span>
      <span className="font-normal tabular-nums">
        {age === null ? t.waiting : stale ? t.staleAge(formatAge(age)) : t.age(formatAge(age))}
      </span>
    </span>
  );
}
