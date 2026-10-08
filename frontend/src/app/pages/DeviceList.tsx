import { Link, useNavigate } from "react-router";
import { FolderClock, LogOut, MonitorOff, RefreshCw } from "lucide-react";
import { DeviceCard } from "../components/DeviceCard";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { EmptyState, PageHeader } from "../components/common";
import { useAuth } from "../context/AuthContext";
import { useDevices } from "./devices/useDevices";
import { notifyError } from "../../lib/notify";
import { de } from "../../i18n/de";

const t = de.devices;

/**
 * Device overview (`/`): one card per oscilloscope with live status. Follows
 * the SSE stream and only polls while it is disconnected.
 * @returns The page
 */
export function DeviceList() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const { devices, isLoading, isRefreshing, error, live, refresh } =
    useDevices(token);

  const handleRefresh = () =>
    refresh().catch((err) => notifyError(err, t.loadError, t.refreshError));

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-(--lab-bg)">
      <PageHeader
        title={t.pageTitle}
        subtitle={live ? t.liveHint : t.pollingHint}
        actions={
          <>
            {user && (
              <span className="text-sm text-(--lab-text-secondary)">
                {user.display_name}
                {user.is_admin && (
                  <span className="ml-1 font-mono text-xs text-(--lab-accent)">
                    [{t.admin}]
                  </span>
                )}
              </span>
            )}
            <Button asChild variant="secondary">
              <Link to="/sessions">
                <FolderClock />
                {t.mySessions}
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label={de.common.actions.refresh}
              title={de.common.actions.refresh}
            >
              <RefreshCw
                className={isRefreshing ? "animate-spin" : undefined}
              />
            </Button>
            <Button variant="secondary" onClick={handleLogout}>
              <LogOut />
              {de.common.actions.logout}
            </Button>
          </>
        }
      />

      <main className="p-4 sm:p-6">
        {error && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded border-2 border-(--lab-danger) bg-white px-4 py-3 text-sm text-(--lab-danger)"
          >
            <span>{error}</span>
            <Button size="sm" variant="danger" onClick={handleRefresh}>
              {de.common.actions.retry}
            </Button>
          </div>
        )}

        {isLoading && devices.length === 0 && (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4"
            aria-busy="true"
          >
            {[1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                className="h-40 rounded border-2 border-(--lab-border)"
              />
            ))}
          </div>
        )}

        {!isLoading && devices.length === 0 && !error && (
          <EmptyState
            icon={<MonitorOff />}
            title={t.empty.title}
            description={t.empty.description}
          />
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onOpen={(d) => navigate(`/device/${d.id}`)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
