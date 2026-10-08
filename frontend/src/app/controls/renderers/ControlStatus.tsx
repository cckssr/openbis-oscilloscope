import { useEffect, useState } from "react";
import { CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "../../components/ui/utils";
import { de } from "../../../i18n/de";
import type { SettingStatus } from "../../state/deviceSession/types";

const t = de.settings.status;

/** How long "✓ übernommen" stays visible, and how long its fade takes (ms). */
const VISIBLE_MS = 2000;
const FADE_MS = 400;

export interface ControlStatusProps {
  /** Status from `useSetting`; undefined = nothing happened yet. */
  status: SettingStatus | undefined;
  /** Icon only (text for screen readers), for tight places like channel headers. */
  compact?: boolean;
  className?: string;
}

/** Phase of the success hint for one `status.at`. */
type Phase = { at: number; phase: "fading" | "gone" };

/**
 * Per-control apply indicator: spinner while the change waits or is written,
 * "✓ übernommen" that fades out after ~2 s, and "⚠ <message>" on errors (the
 * store has already reverted the value). The text lives in an `aria-live`
 * region so assistive tech announces results.
 *
 * @param props - See {@link ControlStatusProps}
 * @returns The indicator (an empty live region while idle)
 */
export function ControlStatus({ status, compact = false, className }: ControlStatusProps) {
  const [hidden, setHidden] = useState<Phase | null>(null);
  const appliedAt = status?.state === "applied" ? status.at : null;

  useEffect(() => {
    if (appliedAt === null) return;
    const remaining = Math.max(0, appliedAt + VISIBLE_MS - Date.now());
    const fade = setTimeout(
      () => setHidden({ at: appliedAt, phase: "fading" }),
      Math.max(0, remaining - FADE_MS),
    );
    const gone = setTimeout(() => setHidden({ at: appliedAt, phase: "gone" }), remaining);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [appliedAt]);

  let content: React.ReactNode = null;
  if (status?.state === "pending" || status?.state === "applying") {
    content = (
      <span className="inline-flex items-center gap-1 text-(--lab-text-secondary)">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        <span className={cn(compact && "sr-only")}>{t.applying}</span>
      </span>
    );
  } else if (status?.state === "applied" && !(hidden?.at === status.at && hidden.phase === "gone")) {
    const fading = hidden?.at === status.at && hidden.phase === "fading";
    content = (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-(--lab-success) transition-opacity",
          fading ? "opacity-0" : "opacity-100",
        )}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      >
        {compact && <CircleCheck className="size-3.5" aria-hidden />}
        <span className={cn(compact && "sr-only")}>{t.applied}</span>
      </span>
    );
  } else if (status?.state === "error") {
    content = (
      <span role="alert" className="inline-flex items-start gap-1 text-(--lab-danger)">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span className={cn(compact && "sr-only")}>
          {status.error || t.errorFallback}
        </span>
      </span>
    );
  }

  return (
    <span aria-live="polite" className={cn("help-text min-w-0 text-right", className)}>
      {content}
    </span>
  );
}
