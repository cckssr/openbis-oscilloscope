import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiLock, apiUnlock, DEVICE, loginAsDebugUser, resetLocks } from "./helpers";

const card = (page: Page, id = DEVICE): Locator => page.locator(`[data-device-id="${id}"]`);

test.beforeEach(async ({ page }) => {
  await resetLocks();
  await loginAsDebugUser(page);
});
test.afterEach(resetLocks);

test("free device offers Öffnen and opens the control page", async ({ page }) => {
  const open = card(page).getByRole("button", { name: "Öffnen" });
  await expect(open).toBeEnabled();
  await open.click();
  await expect(page).toHaveURL(new RegExp(`/device/${DEVICE}$`));
  await expect(page.getByRole("button", { name: /^Gerät übernehmen$/ }).first()).toBeVisible();
});

test("own lock shows Fortsetzen and resumes without taking control again", async ({ page, request }) => {
  const sid = await apiLock(request);
  await page.reload();
  const resume = card(page).getByRole("button", { name: "Fortsetzen" });
  await expect(resume).toBeVisible();
  await expect(card(page)).toContainText("Du steuerst");
  await resume.click();
  await expect(page).toHaveURL(new RegExp(`/device/${DEVICE}$`));
  // The page reclaims the lock that is already ours.
  await expect(page.getByRole("button", { name: /^Gerät freigeben$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Gerät übernehmen$/ })).toHaveCount(0);
  await apiUnlock(request, sid);
});

test("a device locked by someone else shows a disabled Belegt button with owner", async ({ page }) => {
  // Only one DEBUG user exists, so the foreign lock is faked in the device list response.
  await page.route("**/oscilloscope/api/devices", async (route) => {
    const res = await route.fetch();
    const list = (await res.json()) as { id: string; state: string; lock: unknown }[];
    for (const d of list) {
      if (d.id === DEVICE) {
        d.state = "LOCKED";
        d.lock = { owner_user: "alice", acquired_at: Date.now() / 1000, is_mine: false };
      }
    }
    await route.fulfill({ response: res, json: list });
  });
  await page.reload();
  const busy = card(page).getByRole("button", { name: "Belegt" });
  await expect(busy).toBeVisible();
  await expect(busy).toBeDisabled();
  await expect(card(page)).toContainText("alice");
});

test("header links to Meine Messdaten", async ({ page }) => {
  await page.getByRole("link", { name: "Meine Messdaten" }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(page.getByRole("heading", { name: /Meine Messdaten/ }).first()).toBeVisible();
});
