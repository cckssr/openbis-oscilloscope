import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { DeviceCard } from "../components/DeviceCard";
import { useAuth } from "../context/AuthContext";
import { listDevices } from "../../api/devices";
import type { Device } from "../../api/types";
import { LogOut, RefreshCw } from "lucide-react";

export function DeviceList() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await listDevices(token);
      setDevices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Initial load + auto-refresh every 5 s (matches HEALTH_CHECK_INTERVAL_SECONDS)
  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 5_000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-(--lab-bg)">
      <header className="bg-white border-b-2 border-(--lab-border) px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-(--lab-text-primary)">
          Oscilloscope Control System
        </h1>
        <div className="flex items-center gap-4">
          {user && (
            <span className="text-sm text-(--lab-text-secondary)">
              {user.display_name}
              {user.is_admin && (
                <span className="ml-1 text-xs font-mono text-(--lab-accent)">
                  [admin]
                </span>
              )}
            </span>
          )}
          <button
            onClick={fetchDevices}
            disabled={isLoading}
            className="p-1.5 border-2 border-(--lab-border) hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-(--lab-text-primary) transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 border-2 border-(--lab-border) text-sm text-(--lab-text-secondary) hover:text-(--lab-text-primary) hover:bg-(--lab-panel) rounded transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <main className="p-6">
        {error && (
          <div className="mb-4 px-4 py-3 border-2 border-(--lab-danger) rounded text-sm text-(--lab-danger) bg-white">
            {error}
          </div>
        )}

        {isLoading && devices.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 border-2 border-(--lab-border) rounded bg-white animate-pulse"
              />
            ))}
          </div>
        )}

        {!isLoading && devices.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-(--lab-text-secondary)">No devices available</p>
            <p className="text-sm text-(--lab-text-secondary) mt-1">
              Check the server configuration or network connection
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              label={device.label}
              id={device.id}
              status={device.state}
              ipAddress={device.ip}
              lockOwner={device.lock?.owner_user}
              isMyLock={device.lock?.is_mine}
              onOpen={() => navigate(`/device/${device.id}`)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
