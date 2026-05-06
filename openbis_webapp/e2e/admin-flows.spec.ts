/**
 * Admin flows: force-unlock, reset all locks, keyboard lock toggle.
 *
 * These tests call the admin API directly (no admin UI exists in the frontend)
 * and verify the effects are reflected in the device state visible to the UI.
 */

import { test, expect } from "./fixtures";

const DEVICE_ID = process.env.HW_PRIMARY_DEVICE ?? "scope-01";
const API_BASE = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const token = process.env.OPENBIS_TEST_TOKEN ?? process.env.OPENBIS_TOKEN ?? "";

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function lockDevice(): Promise<string | null> {
  const resp = await fetch(`${API_BASE}/devices/${DEVICE_ID}/lock`, {
    method: "POST",
    headers,
  });
  if (!resp.ok) return null;
  return (await resp.json()).control_session_id as string;
}

async function unlockDevice(sessionId: string): Promise<void> {
  await fetch(
    `${API_BASE}/devices/${DEVICE_ID}/unlock?session_id=${sessionId}`,
    { method: "POST", headers }
  );
}

test("admin force-unlock releases a held lock", async ({
  authenticatedPage: page,
}) => {
  if (!token) test.skip(true, "No token set");

  // Lock device via API
  const sessionId = await lockDevice();
  if (!sessionId) test.skip(true, "Could not lock device for test setup");

  // Confirm device is LOCKED in the UI
  await page.goto(`/device/${DEVICE_ID}`);
  await expect(page.getByText(/LOCKED|gesperrt/i)).toBeVisible({
    timeout: 10_000,
  });

  // Force-unlock via admin API
  const forceResp = await fetch(
    `${API_BASE}/admin/devices/${DEVICE_ID}/force-unlock`,
    { method: "POST", headers }
  );
  expect(forceResp.ok).toBeTruthy();
  const { released } = await forceResp.json();
  expect(released).toBe(true);

  // Reload page — device should now show as ONLINE
  await page.reload();
  await expect(page.getByText(/ONLINE/i)).toBeVisible({ timeout: 10_000 });
});

test("admin reset-all-locks clears every device", async ({
  authenticatedPage: page,
}) => {
  if (!token) test.skip(true, "No token set");

  // Lock device
  await lockDevice();

  // Reset all locks
  const resetResp = await fetch(`${API_BASE}/admin/locks/reset`, {
    method: "POST",
    headers,
  });
  expect(resetResp.ok).toBeTruthy();
  const { locks_cleared } = await resetResp.json();
  expect(locks_cleared).toBeGreaterThanOrEqual(1);

  // Device list should show all devices as ONLINE
  await page.goto("/");
  await page.waitForTimeout(2_000); // wait for auto-refresh
  await expect(page.getByText(/ONLINE/)).toBeVisible({ timeout: 10_000 });
  const lockedBadges = await page.getByText(/LOCKED/).count();
  expect(lockedBadges).toBe(0);
});

test("keyboard lock toggle changes front-panel state", async () => {
  if (!token) test.skip(true, "No token set");

  // Enable keyboard lock
  const lockResp = await fetch(
    `${API_BASE}/admin/devices/${DEVICE_ID}/keyboard-lock?locked=true`,
    { method: "POST", headers }
  );
  expect(lockResp.ok).toBeTruthy();
  const lockData = await lockResp.json();
  expect(lockData.keyboard_locked).toBe(true);

  // Disable keyboard lock
  const unlockResp = await fetch(
    `${API_BASE}/admin/devices/${DEVICE_ID}/keyboard-lock?locked=false`,
    { method: "POST", headers }
  );
  expect(unlockResp.ok).toBeTruthy();
  const unlockData = await unlockResp.json();
  expect(unlockData.keyboard_locked).toBe(false);
});
