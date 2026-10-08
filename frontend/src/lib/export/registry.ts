import type { ExportInput, Exporter } from "./types";

const exporters = new Map<string, Exporter>();

/**
 * Adds an exporter; an existing one with the same id is replaced.
 * @param exporter - The exporter to register
 */
export function registerExporter(exporter: Exporter): void {
  exporters.set(exporter.id, exporter);
}

/**
 * Lists exporters in registration order.
 * @param input - When given, only exporters that can run with it are returned
 * @returns The matching exporters
 */
export function listExporters(input?: ExportInput): Exporter[] {
  const all = [...exporters.values()];
  return input ? all.filter((e) => e.isAvailable?.(input) ?? true) : all;
}

/**
 * Looks up an exporter.
 * @param id - Exporter id such as "csv"
 * @returns The exporter or undefined
 */
export function getExporter(id: string): Exporter | undefined {
  return exporters.get(id);
}
