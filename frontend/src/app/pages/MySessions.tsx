/**
 * "Meine Messdaten" page `/sessions`: the user's control sessions grouped by
 * day with upload status, each opening its archive.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Inbox, RefreshCw } from "lucide-react";
import { listMySessions } from "../../api/sessions";
import type { SessionSummary } from "../../api/types";
import { de } from "../../i18n/de";
import { notifyError } from "../../lib/notify";
import { formatDate, formatTime } from "../../lib/units";
import { EmptyState, PageHeader, RegionBoundary } from "../components/common";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useAuth } from "../context/AuthContext";
import { useAppConfig } from "../hooks/useAppConfig";
import { SessionRow } from "./sessions/SessionRow";
import { groupSessionsByDay, relativeDay } from "./sessions/groupSessions";

const t = de.archive.sessions;

/**
 * The "Meine Messdaten" page.
 * @returns The session list with retention note and empty state
 */
export function MySessions() {
  const { token } = useAuth();
  const config = useAppConfig();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback((): Promise<void> => {
    if (!token) return Promise.resolve();
    return listMySessions(token)
      .then(setSessions)
      .catch((err) => {
        notifyError(err, t.loadError, t.loadError);
        setSessions((prev) => prev ?? []);
      })
      .finally(() => setIsRefreshing(false));
  }, [token]);

  const refresh = () => {
    setIsRefreshing(true);
    void load();
  };

  // Initial load; `load` sets state only after the request resolved.
  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo(() => groupSessionsByDay(sessions ?? []), [sessions]);

  return (
    <div className="flex min-h-dvh flex-col bg-(--lab-bg)">
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        backTo="/"
        backLabel={t.back}
        actions={
          <Button variant="secondary" size="icon" onClick={refresh} aria-label={t.refresh} title={t.refresh}>
            <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-4 sm:px-6">
        <p className="mb-4 rounded border border-(--lab-border) bg-(--lab-panel) px-3 py-2 text-sm text-(--lab-text-secondary)">
          {t.retention(config?.eod_reset_time ?? null)}
        </p>
        <RegionBoundary name={t.title}>
          {sessions === null ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : days.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title={t.empty.title}
              description={t.empty.text}
              action={
                <Button asChild variant="secondary">
                  <Link to="/">{t.empty.action}</Link>
                </Button>
              }
            />
          ) : (
            days.map((day) => {
              const rel = relativeDay(day.dayKey);
              return (
                <section key={day.dayKey} className="mb-6" aria-label={formatDate(day.date)}>
                  <h2 className="mb-2 text-xs font-semibold tracking-wide text-(--lab-text-secondary) uppercase">
                    {rel ? `${t[rel]} · ` : ""}
                    {formatDate(day.date)}
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {day.sessions.map((s) => (
                      <SessionRow key={s.session_id} session={s} startedAt={formatTime(s.created_at)} />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </RegionBoundary>
      </main>
    </div>
  );
}
