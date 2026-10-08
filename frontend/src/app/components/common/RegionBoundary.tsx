import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { de } from "../../../i18n/de";

export interface RegionBoundaryProps {
  children: ReactNode;
  /** Name of the region for the message and the log, e.g. "Kurvenanzeige". */
  name?: string;
  /** Reset automatically when any of these values changes (e.g. the device id). */
  resetKeys?: unknown[];
  /** Replaces the default fallback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  className?: string;
}

interface State {
  error: Error | null;
}

const t = de.common.region;

const keysChanged = (a: unknown[] = [], b: unknown[] = []) =>
  a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));

/**
 * Per-region error boundary: a crash in one panel shows a German fallback with
 * "Erneut versuchen" while the rest of the page (lock, live loop) keeps working.
 * Errors are logged to the console with the region name.
 */
export class RegionBoundary extends Component<RegionBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[RegionBoundary:${this.props.name ?? "?"}]`,
      error,
      info.componentStack,
    );
  }

  componentDidUpdate(prev: RegionBoundaryProps) {
    if (this.state.error && keysChanged(prev.resetKeys, this.props.resetKeys))
      this.reset();
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-col items-start gap-2 rounded border-2 border-(--lab-danger) bg-white p-4",
          this.props.className,
        )}
      >
        <div className="flex items-center gap-2 font-medium text-(--lab-danger)">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {t.title}
        </div>
        {this.props.name && (
          <p className="help-text">{t.named(this.props.name)}</p>
        )}
        <p className="help-text break-all font-mono">{error.message}</p>
        <Button size="sm" variant="secondary" onClick={this.reset}>
          {t.retry}
        </Button>
      </div>
    );
  }
}
