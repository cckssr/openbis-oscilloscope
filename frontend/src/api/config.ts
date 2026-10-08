import { apiBaseUrl } from "./client";
import { AppConfigSchema } from "./schemas";
import type { AppConfig } from "./types";
import { parseOrThrow } from "./validate";

let cached: Promise<AppConfig> | null = null;

/**
 * Loads the public runtime configuration (`GET /config`, no auth required).
 * The result is cached for the lifetime of the page.
 * @returns A promise resolving to the validated backend configuration (defaults fill missing fields)
 */
export function getConfig(): Promise<AppConfig> {
  cached ??= fetch(`${apiBaseUrl}api/config`).then((res) => {
    if (!res.ok) throw new Error(`GET /config failed: ${res.status}`);
    return res
      .json()
      .then((raw: unknown) =>
        parseOrThrow(AppConfigSchema, raw, "GET /config"),
      );
  });
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
