import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

export const DEBUG_TOKEN = "debug-token";
export const API = "http://localhost:8000";
export const DEVICE = "scope-01";

const AUTH = { Authorization: `Bearer ${DEBUG_TOKEN}` };

/** The three page layouts of the control page (`useBreakpoint`). */
export type LayoutKind = "desktop" | "landscape" | "portrait";

/**
 * Maps a Playwright project to the control-page layout it exercises.
 * @param testInfo - The running test's info
 * @returns `desktop` (1280 px and wider), `landscape` (1024) or `portrait` (768)
 */
export function layoutOf(testInfo: TestInfo): LayoutKind {
  const name = testInfo.project.name;
  if (name === "tablet-landscape") return "landscape";
  if (name === "tablet-portrait") return "portrait";
  return "desktop";
}

/**
 * Whether the project emulates a touch tablet.
 * @param testInfo - The running test's info
 * @returns True for the two tablet projects
 */
export function isTablet(testInfo: TestInfo): boolean {
  return testInfo.project.name.startsWith("tablet");
}

/**
 * Logs in with the DEBUG token by seeding localStorage (the login form itself
 * is covered by login.spec.ts).
 * @param page - The Playwright page
 */
export async function loginAsDebugUser(page: Page): Promise<void> {
  await page.goto("login");
  await page.evaluate((t) => localStorage.setItem("osc_auth_token", t), DEBUG_TOKEN);
  await page.goto("./");
  await expect(page).not.toHaveURL(/login/);
}

/**
 * Force-releases every lock on the backend so specs start from a clean state.
 * Uses the admin endpoint (the DEBUG user is admin).
 */
export async function resetLocks(): Promise<void> {
  await fetch(`${API}/admin/locks/reset`, { method: "POST", headers: AUTH }).catch(() => {});
}

/** One artifact as returned by `GET /sessions/{id}/artifacts`. */
export interface ApiArtifact {
  artifact_id: string;
  artifact_type: string;
  channel: number | null;
  acquisition_id: string | null;
  persist: boolean;
  uploaded: boolean;
  annotation?: string | null;
}

/**
 * Takes the device lock through the API.
 * @param request - Playwright API context
 * @param deviceId - Device id
 * @returns The control session id
 */
export async function apiLock(request: APIRequestContext, deviceId = DEVICE): Promise<string> {
  const res = await request.post(`${API}/devices/${deviceId}/lock`, { headers: AUTH });
  expect(res.ok(), `lock ${deviceId}: ${res.status()}`).toBe(true);
  return (await res.json()).control_session_id as string;
}

/**
 * Releases the device lock held by `sessionId`.
 * @param request - Playwright API context
 * @param sessionId - Control session id from {@link apiLock}
 * @param deviceId - Device id
 */
export async function apiUnlock(
  request: APIRequestContext,
  sessionId: string,
  deviceId = DEVICE,
): Promise<void> {
  await request.post(`${API}/devices/${deviceId}/unlock?session_id=${sessionId}`, { headers: AUTH });
}

/**
 * Stores one capture (all enabled channels) through the API.
 * @param request - Playwright API context
 * @param sessionId - Control session id
 * @param deviceId - Device id
 * @returns The new acquisition id
 */
export async function apiCapture(
  request: APIRequestContext,
  sessionId: string,
  deviceId = DEVICE,
): Promise<string> {
  const res = await request.post(`${API}/devices/${deviceId}/acquire?session_id=${sessionId}`, {
    headers: AUTH,
  });
  expect(res.ok(), `acquire: ${res.status()}`).toBe(true);
  return (await res.json()).acquisition_id as string;
}

/**
 * Lists the artifacts of a session.
 * @param request - Playwright API context
 * @param sessionId - Control session id
 * @returns All artifacts (traces and screenshots)
 */
export async function apiArtifacts(
  request: APIRequestContext,
  sessionId: string,
): Promise<ApiArtifact[]> {
  const res = await request.get(`${API}/sessions/${sessionId}/artifacts`, { headers: AUTH });
  if (!res.ok()) return [];
  return (await res.json()) as ApiArtifact[];
}

/**
 * Number of distinct captures ("Aufnahmen") among the artifacts.
 * @param artifacts - Artifact list
 * @returns Distinct acquisition ids plus screenshots and legacy traces
 */
export function captureCount(artifacts: ApiArtifact[]): number {
  const ids = new Set<string>();
  for (const a of artifacts) ids.add(a.acquisition_id ?? a.artifact_id);
  return ids.size;
}

/**
 * Reads the current lock of a device.
 * @param request - Playwright API context
 * @param deviceId - Device id
 * @returns The lock object or null when the device is free
 */
export async function apiDeviceLock(
  request: APIRequestContext,
  deviceId = DEVICE,
): Promise<{ owner_user: string; session_id?: string; is_mine?: boolean } | null> {
  const res = await request.get(`${API}/devices/${deviceId}`, { headers: AUTH });
  return ((await res.json()).lock ?? null) as { owner_user: string; session_id?: string } | null;
}

/** Scope state as returned by `GET /devices/{id}/settings`. */
export interface ApiSettings {
  channels: Record<
    string,
    { enabled: boolean; scale_v_div: number; offset_v: number; coupling: string; probe_attenuation: number }
  >;
  timebase: { scale_s_div: number; offset_s: number };
  trigger: { source: string; level_v: number; slope: string; mode: string };
}

/**
 * Reads the scope settings.
 * @param request - Playwright API context
 * @param deviceId - Device id
 * @returns The settings snapshot
 */
export async function apiSettings(
  request: APIRequestContext,
  deviceId = DEVICE,
): Promise<ApiSettings> {
  const res = await request.get(`${API}/devices/${deviceId}/settings`, { headers: AUTH });
  return (await res.json()) as ApiSettings;
}

/**
 * Puts the mock scope back into its power-on state (4 channels on at 1 V/div,
 * 0.5 ms/div, trigger CH1 rising at 0 V, AUTO) and optionally overrides the
 * timebase. Takes and releases its own lock, so call it while the device is free.
 * @param request - Playwright API context
 * @param opts - `timebase`: s/div to set instead of the default
 * @param deviceId - Device id
 */
export async function resetScope(
  request: APIRequestContext,
  opts: { timebase?: number } = {},
  deviceId = DEVICE,
): Promise<void> {
  const sid = await apiLock(request, deviceId);
  const q = `session_id=${sid}`;
  const put = (path: string, data: object) =>
    request.put(`${API}/devices/${deviceId}/${path}?${q}`, { headers: AUTH, data });
  await Promise.all([
    ...[1, 2, 3, 4].map((ch) =>
      put(`channels/${ch}/config`, {
        enabled: true,
        scale_v_div: 1,
        offset_v: 0,
        coupling: "DC",
        probe_attenuation: 1,
      }),
    ),
    put("timebase", { scale_s_div: opts.timebase ?? 5e-4, offset_s: 0 }),
    put("trigger", { source: "CH1", level_v: 0, slope: "RISE", mode: "AUTO" }),
  ]);
  await apiUnlock(request, sid, deviceId);
}
