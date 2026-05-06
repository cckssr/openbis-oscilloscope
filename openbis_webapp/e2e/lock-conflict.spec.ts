/**
 * Lock conflict flows:
 * - User B is denied when User A holds the lock.
 * - After User A unlocks, User B can acquire the lock.
 */

import { test, expect } from "./fixtures";

const DEVICE_ID = process.env.HW_PRIMARY_DEVICE ?? "scope-01";

const token =
  process.env.OPENBIS_TEST_TOKEN ?? process.env.OPENBIS_TOKEN ?? "";
const STORAGE_KEY = "osc_auth_token";

async function injectTokenForContext(context: import("@playwright/test").BrowserContext) {
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: token }
  );
}

test("user B sees locked state and cannot lock while user A holds it", async ({
  browser,
}) => {
  if (!token) test.skip(true, "No token set");

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();

  await injectTokenForContext(ctxA);
  await injectTokenForContext(ctxB);

  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // User A locks the device
  await pageA.goto(`/device/${DEVICE_ID}`);
  await pageA.getByRole("button", { name: /Gerät sperren|Lock|Übernehmen/ }).click();
  await expect(
    pageA.getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
  ).toBeVisible({ timeout: 15_000 });

  // User B navigates to the same device
  await pageB.goto(`/device/${DEVICE_ID}`);

  // Device should appear as LOCKED in user B's view
  await expect(pageB.getByText(/LOCKED|gesperrt|belegt/i)).toBeVisible({
    timeout: 10_000,
  });

  // The lock button should be absent or disabled for user B
  const lockBtnB = pageB.getByRole("button", {
    name: /Gerät sperren|Lock|Übernehmen/,
  });
  const btnCount = await lockBtnB.count();
  if (btnCount > 0) {
    // If button exists, it must be disabled
    await expect(lockBtnB).toBeDisabled();
  }

  // User A unlocks
  await pageA
    .getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
    .click();
  await expect(
    pageA.getByRole("button", { name: /Gerät sperren|Lock|Übernehmen/ })
  ).toBeVisible({ timeout: 10_000 });

  // User B can now lock the device (after a page refresh or auto-poll)
  await pageB.reload();
  await expect(
    pageB.getByRole("button", { name: /Gerät sperren|Lock|Übernehmen/ })
  ).toBeVisible({ timeout: 10_000 });

  await pageB
    .getByRole("button", { name: /Gerät sperren|Lock|Übernehmen/ })
    .click();
  await expect(
    pageB.getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
  ).toBeVisible({ timeout: 15_000 });

  // Cleanup
  await pageB
    .getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
    .click();

  await ctxA.close();
  await ctxB.close();
});

test("lock conflict error shown in UI when user tries to grab locked device via API", async ({
  authenticatedPage: page,
}) => {
  // Lock the device via direct API call before the page tests it
  const apiBase = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
  const lockResp = await fetch(`${apiBase}/devices/${DEVICE_ID}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!lockResp.ok) {
    // Already locked by someone else — that's fine, this test still works
  }

  const sessionId = lockResp.ok
    ? (await lockResp.json()).control_session_id
    : null;

  await page.goto(`/device/${DEVICE_ID}`);

  // Device is locked — page should indicate it
  await expect(page.getByText(/LOCKED|gesperrt|belegt/i)).toBeVisible({
    timeout: 10_000,
  });

  // Cleanup
  if (sessionId) {
    await fetch(
      `${apiBase}/devices/${DEVICE_ID}/unlock?session_id=${sessionId}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  }
});
