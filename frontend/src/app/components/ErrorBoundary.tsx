import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/button";
import { de } from "../../i18n/de";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const t = de.common.errorBoundary;

/**
 * Root error boundary: replaces the whole app with a German "Etwas ist
 * schiefgelaufen" screen and a reload button. Use `RegionBoundary` for
 * individual panels so one broken control cannot take the page down.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-(--lab-bg) p-8">
          <div
            role="alert"
            className="w-full max-w-md space-y-4 rounded border-2 border-(--lab-danger) bg-white p-6"
          >
            <h1 className="text-lg font-semibold text-(--lab-danger)">
              {t.title}
            </h1>
            <p className="text-sm text-(--lab-text-secondary)">{t.hint}</p>
            <p className="break-all font-mono text-xs text-(--lab-text-secondary)">
              {this.state.error.message}
            </p>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => window.location.reload()}
            >
              {t.reload}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
