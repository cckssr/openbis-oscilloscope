/**
 * Readers for a session token that openBIS hands over: the `openbis` cookie
 * (shared parent domain) or a `#token=…` URL fragment. Used by
 * {@link AuthProvider} on startup and by the login page's "Anmeldung prüfen".
 */

/**
 * Reads the `openbis` cookie.
 * @returns The token, or null when the cookie is absent
 */
export function readOpenBISCookie(): string | null {
  const raw = document.cookie.match(/(?:^|;\s*)openbis=([^;]+)/)?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Reads a `#token=…` fragment and removes it from the URL (it is a secret).
 * @returns The token, or null when the URL has no such fragment
 */
export function readOpenBISTokenFragment(): string | null {
  const match = window.location.hash.match(/token=([^&]+)/);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  window.location.hash = "";
  return token;
}

/** Thrown by `loginFromOpenBISCookie()` when openBIS left no session behind. */
export class NoOpenBISSessionError extends Error {
  constructor() {
    super("No openBIS session found");
    this.name = "NoOpenBISSessionError";
  }
}
