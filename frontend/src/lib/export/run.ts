import { downloadBlob, downloadUrl, safeFilename } from "../download";
import type { ExportInput, Exporter } from "./types";

/**
 * Runs an exporter and saves the result through the browser.
 * @param exporter - The exporter to run
 * @param input - Export input
 * @throws Whatever the exporter throws (callers toast it with `notifyError`)
 */
export async function runExporter(exporter: Exporter, input: ExportInput): Promise<void> {
  const result = await exporter.run(input);
  const filename = `${safeFilename(input.baseName)}.${exporter.ext}`;
  if (result instanceof Blob) downloadBlob(result, filename);
  else downloadUrl(result.serverUrl, filename);
}
