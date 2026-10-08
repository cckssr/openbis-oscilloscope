/**
 * Plotly build used by the app: the `gl2d` bundle (cartesian + scattergl,
 * ~1.5 MB) instead of the full 4.8 MB `plotly.js`. Importing this module pulls
 * Plotly in, so only the plot component and lazy `import()`s (PNG export) use it.
 */
import PlotlyModule from "plotly.js/dist/plotly-gl2d.min.js";
import createPlotlyComponent from "react-plotly.js/factory";

// CJS/UMD interop differs between Vite dev (pre-bundled) and build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plotly = ((PlotlyModule as any).default ??
  PlotlyModule) as typeof PlotlyModule;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const factory = ((createPlotlyComponent as any).default ??
  createPlotlyComponent) as typeof createPlotlyComponent;

/** `<Plot>` bound to the gl2d bundle. */
export const Plot = factory(Plotly);
export { Plotly };
