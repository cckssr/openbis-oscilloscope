import { createBrowserRouter, Navigate, useParams } from "react-router";
import type { ReactNode } from "react";
import { DeviceList } from "./pages/DeviceList";
import { Login } from "./pages/Login";
import { useAuth } from "./context/AuthContext";

/** Redirect to /login when not authenticated, show a hint while validating. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { token, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-(--lab-bg) flex items-center justify-center">
        <span className="text-sm text-(--lab-text-secondary)">
          Anmeldung wird geprüft…
        </span>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Forces a full remount of the control page when the device route changes. */
function KeyedOscilloscopeControl({
  Page,
}: {
  Page: (props: object) => ReactNode;
}) {
  const { deviceId } = useParams<{ deviceId: string }>();
  return <Page key={deviceId} />;
}

// BASE_URL is set by Vite from the `base` option (default "/oscilloscope/").
const baseUrl = import.meta.env.BASE_URL ?? "/";

// Pages with Plotly are lazy-loaded so login and device list stay small.
export const router = createBrowserRouter(
  [
    { path: "/login", Component: Login },
    {
      path: "/",
      element: (
        <RequireAuth>
          <DeviceList />
        </RequireAuth>
      ),
    },
    {
      path: "/device/:deviceId",
      lazy: async () => {
        const { OscilloscopeControl } =
          await import("./pages/OscilloscopeControl");
        return {
          element: (
            <RequireAuth>
              <KeyedOscilloscopeControl Page={OscilloscopeControl} />
            </RequireAuth>
          ),
        };
      },
    },
    {
      path: "/archive/:sessionId",
      lazy: async () => {
        const { DataArchive } = await import("./pages/DataArchive");
        return {
          element: (
            <RequireAuth>
              <DataArchive />
            </RequireAuth>
          ),
        };
      },
    },
    {
      path: "/sessions",
      lazy: async () => {
        const { MySessions } = await import("./pages/MySessions");
        return {
          element: (
            <RequireAuth>
              <MySessions />
            </RequireAuth>
          ),
        };
      },
    },
    { path: "*", element: <Navigate to="/" replace /> },
  ],
  { basename: baseUrl },
);
