import { expect, type Page } from "@playwright/test";

export const DEBUG_TOKEN = "debug-token";
const API = "http://localhost:8000";

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
  await fetch(`${API}/admin/locks/reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${DEBUG_TOKEN}` },
  }).catch(() => {});
}
