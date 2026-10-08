import type { Analysis } from "./types";

const analyses = new Map<string, Analysis>();

/**
 * Adds an analysis; an existing one with the same id is replaced.
 * @param analysis - The analysis to register
 */
export function registerAnalysis(analysis: Analysis): void {
  analyses.set(analysis.id, analysis);
}

/**
 * Looks up an analysis.
 * @param id - Analysis id such as "vpp"
 * @returns The analysis or undefined
 */
export function getAnalysis(id: string): Analysis | undefined {
  return analyses.get(id);
}

/**
 * Lists registered analyses in registration order.
 * @param level - "basic" returns only basic analyses, "expert" returns all
 *   (the expert view is a superset); omit for everything
 * @returns The matching analyses
 */
export function listAnalyses(level?: "basic" | "expert"): Analysis[] {
  const all = [...analyses.values()];
  return level === "basic" ? all.filter((a) => a.level === "basic") : all;
}
