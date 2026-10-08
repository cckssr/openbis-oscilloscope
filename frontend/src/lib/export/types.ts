/**
 * Contracts of the export registry (review §6.4). One "Exportieren" menu lists
 * whatever is registered and applicable to the current data.
 */
import type { Trace } from "../trace";

/** Everything an exporter may need; each exporter checks what it requires. */
export interface ExportInput {
  /** Full-resolution traces (CSV, NumPy). */
  traces?: Trace[];
  /** The Plotly graph div (PNG). */
  plotElement?: HTMLElement | null;
  /** Bearer token for server-side exports. */
  token?: string;
  /** Session holding the artifacts for server-side exports. */
  sessionId?: string;
  /** Trace artifacts selected for server-side exports. */
  artifactIds?: string[];
  /** File name without extension, e.g. "scope-01_Aufnahme-5". */
  baseName: string;
}

export interface Exporter {
  id: string;
  /** German menu label, e.g. "CSV (Tabelle)". */
  label: string;
  /** File extension without dot. */
  ext: string;
  /** What the export is made of: one capture, a selection of artifacts, or the plot image. */
  appliesTo: "capture" | "selection" | "plot";
  /** Whether the exporter can run with this input; hidden from the menu otherwise. */
  isAvailable?(input: ExportInput): boolean;
  /** Builds the file in the browser or on the server. */
  run(input: ExportInput): Promise<Blob | { serverUrl: string }>;
}
