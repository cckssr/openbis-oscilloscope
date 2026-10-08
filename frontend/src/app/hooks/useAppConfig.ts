import { useEffect, useState } from "react";
import { getConfig } from "../../api/config";
import type { AppConfig } from "../../api/types";

/**
 * Returns the public backend configuration (`GET /config`), or null while it
 * loads or when the backend is unreachable. Cached for the page lifetime.
 * @returns The configuration or null
 */
export function useAppConfig(): AppConfig | null {
  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    let alive = true;
    getConfig()
      .then((c) => alive && setConfig(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return config;
}
