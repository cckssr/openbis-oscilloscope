import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./context/AuthContext";
import { DeviceSessionProvider } from "./state/DeviceSessionProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DeviceSessionProvider>
          <RouterProvider router={router} />
        </DeviceSessionProvider>
        <Toaster />
      </AuthProvider>
    </ErrorBoundary>
  );
}
