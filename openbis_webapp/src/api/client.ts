const baseUrl =
  (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ??
  "/";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

/**
 * Central fetch wrapper. Injects the Bearer token and parses the response.
 * Returns the JSON body for application/json responses, or the raw Blob for
 * binary responses (e.g. the screenshot PNG endpoint).
 * Throws ApiError for any non-2xx status.
 */
export async function apiFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${baseUrl}api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let code = "unknown";
    let detail = res.statusText;
    try {
      const body = await res.json();
      code = body.error ?? code;
      detail = body.detail ?? detail;
    } catch {
      // response body may not be JSON (e.g. 502 from nginx)
    }
    throw new ApiError(res.status, code, detail);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  // Binary response (image/png, etc.)
  return res.blob() as unknown as Promise<T>;
}
