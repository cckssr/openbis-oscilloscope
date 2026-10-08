/** Browser download helpers shared by exporters and pages. */

/**
 * Replaces characters that are unsafe in file names.
 * @param name - Proposed file name (without extension)
 * @returns A file-system-safe name, "export" when nothing is left
 */
export function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "export";
}

/**
 * Saves a blob through a temporary `<a download>` link.
 * @param blob - The content to save
 * @param filename - Suggested file name including extension
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  // Give the browser time to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Triggers a download of an arbitrary URL (e.g. a server-built file).
 * @param url - Absolute or relative URL
 * @param filename - Suggested file name including extension
 */
export function downloadUrl(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
