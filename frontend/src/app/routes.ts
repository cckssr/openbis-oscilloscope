import { createBrowserRouter, Navigate, useParams } from "react-router";
import { createElement } from "react";
import { DeviceList } from "./pages/DeviceList";
import { OscilloscopeControl } from "./pages/OscilloscopeControl";
import { DataArchive } from "./pages/DataArchive";
import { Login } from "./pages/Login";
import { useAuth } from "./context/AuthContext";

/** Forces a full remount of OscilloscopeControl when the device route changes. */
function KeyedOscilloscopeControl() {
  const { deviceId } = useParams<{ deviceId: string }>();
  return createElement(OscilloscopeControl, { key: deviceId });
}

/** Redirect to /login when not authenticated, show spinner while loading. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  if (isLoading) {
    return createElement(
      "div",
      {
        className:
          "min-h-screen bg-(--lab-bg) flex items-center justify-center",
      },
      createElement(
        "span",
        { className: "text-sm text-(--lab-text-secondary)" },
        "Loading…",
      ),
    );
  }
  if (!token) return createElement(Navigate, { to: "/login", replace: true });
  return children as React.ReactElement;
}

// BASE_URL is set by Vite from the --base flag at build time (default "/").
// For sub-path deployments (e.g. /oscilloscope/) pass --base=/oscilloscope/ to pnpm run build.
const baseUrl =
  (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ??
  "/";

export const router = createBrowserRouter(
  [
    {
      path: "/login",
      Component: Login,
    },
    {
      path: "/",
      element: createElement(RequireAuth, null, createElement(DeviceList)),
    },
    {
      path: "/device/:deviceId",
      element: createElement(
        RequireAuth,
        null,
        createElement(KeyedOscilloscopeControl),
      ),
    },
    {
      path: "/archive/:sessionId",
      element: createElement(RequireAuth, null, createElement(DataArchive)),
    },
  ],
  { basename: baseUrl },
);
