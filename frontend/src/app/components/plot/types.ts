import type { ReactNode } from "react";
import type { Overlay, Timebase, Trace } from "../../../lib/trace";

/**
 * Props of `<WaveformPlot>` (components/plot/WaveformPlot.tsx), used by the
 * live control page and the archive preview.
 */
export interface WaveformPlotProps {
  traces: Trace[];
  overlays?: Overlay[];
  /**
   * Scope horizontal frame. When given, the x range is the full screen
   * (10 divisions) around the trigger offset; otherwise the data extent.
   */
  timebase?: Timebase;
  /**
   * "divisions" (default when every trace has `scale`): each channel is drawn
   * with its own V/div and offset like on the scope screen, the y axis is in
   * divisions (±4) and per-channel scales are shown in the readout bar.
   * "volts": all traces share one axis in volts.
   */
  yMode?: "divisions" | "volts";
  /**
   * Zoom/pan persists while this key stays the same (live frames keep the
   * user's zoom); change it to reset the view (e.g. new device or capture).
   */
  viewKey?: string;
  /** Show the readout bar under the plot (per-channel scale, timebase, rate, depth). */
  showReadouts?: boolean;
  /** Samples per channel of the displayed data, shown in the readout bar. */
  memoryDepth?: number;
  /** Extra buttons rendered at the end of the plot toolbar (e.g. export menu). */
  toolbarExtras?: ReactNode;
  /** Message shown instead of the plot when there are no traces. */
  emptyMessage?: ReactNode;
  className?: string;
}
