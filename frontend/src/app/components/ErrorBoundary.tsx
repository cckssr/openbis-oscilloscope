import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

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
        <div className="min-h-screen bg-(--lab-bg) flex items-center justify-center p-8">
          <div className="max-w-md w-full border-2 border-(--lab-danger) rounded bg-white p-6 space-y-4">
            <h1 className="text-lg font-semibold text-(--lab-danger)">
              Something went wrong
            </h1>
            <p className="text-sm text-(--lab-text-secondary) font-mono break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 px-4 border-2 border-(--lab-accent) text-(--lab-accent) text-sm font-medium rounded hover:bg-(--lab-accent) hover:text-white transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
