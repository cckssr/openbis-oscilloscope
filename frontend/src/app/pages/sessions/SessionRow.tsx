import { Link } from "react-router";
import { CircleCheck, CloudOff, Radio } from "lucide-react";
import { Button } from "../../components/ui/button";
import { de } from "../../../i18n/de";
import type { SessionSummary } from "../../../api/types";
import { sessionStatus } from "./groupSessions";

const t = de.archive.sessions;

function StatusChip({ session }: { session: SessionSummary }) {
  const status = sessionStatus(session);
  const base = "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium";
  switch (status.kind) {
    case "active":
      return (
        <span className={`${base} border-(--lab-accent) bg-(--lab-accent)/10 text-(--lab-accent)`}>
          <Radio className="size-3.5" aria-hidden /> {t.status.active}
        </span>
      );
    case "allUploaded":
      return (
        <span className={`${base} border-(--lab-success) bg-(--lab-success)/10 text-(--lab-success)`}>
          <CircleCheck className="size-3.5" aria-hidden /> {t.status.allUploaded}
        </span>
      );
    case "pending":
      return (
        <span className={`${base} border-(--lab-warning) bg-(--lab-warning)/10 text-(--lab-warning)`}>
          <CloudOff className="size-3.5" aria-hidden /> {t.status.pending(status.count)}
        </span>
      );
    case "empty":
      return <span className={`${base} border-(--lab-border) text-(--lab-text-secondary)`}>{t.status.empty}</span>;
  }
}

/**
 * One session: device, start time, counts, status chip and the "Öffnen" button.
 * @param props.session - Session summary
 * @param props.startedAt - Formatted start time
 * @returns A list item
 */
export function SessionRow({ session, startedAt }: { session: SessionSummary; startedAt: string }) {
  const { counts } = session;
  const parts = [
    counts.acquisitions > 0 || counts.screenshots === 0 ? t.counts.captures(counts.acquisitions) : null,
    counts.screenshots > 0 ? t.counts.screenshots(counts.screenshots) : null,
    counts.flagged > 0 ? t.counts.selected(counts.flagged) : null,
    counts.uploaded > 0 ? t.counts.uploaded(counts.uploaded) : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border-2 border-(--lab-border) bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-(--lab-text-primary)">{session.device_label}</p>
        <p className="help-text">
          {t.started(startedAt)} · {parts.join(" · ")}
        </p>
      </div>
      <StatusChip session={session} />
      <Button asChild variant="secondary">
        <Link to={`/archive/${session.session_id}`}>{t.open}</Link>
      </Button>
    </li>
  );
}
