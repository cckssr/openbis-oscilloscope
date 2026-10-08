import { apiBaseUrl } from "./client";
import type { AppConfig } from "./types";

let cached: Promise<AppConfig> | null = null;

/**
 * Loads the public runtime configuration (`GET /config`, no auth required).
 * The result is cached for the lifetime of the page.
 * @returns A promise resolving to the backend configuration
 */
export function getConfig(): Promise<AppConfig> {
  cached ??= fetch(`${apiBaseUrl}api/config`).then((res) => {
    if (!res.ok) throw new Error(`GET /config failed: ${res.status}`);
    return res.json() as Promise<AppConfig>;
  });
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
