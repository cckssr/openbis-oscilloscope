/**
 * Multi-device: two browser contexts (simulated users) each lock a different
 * device, acquire concurrently, and commit — neither should block the other.
 *
 * Requires at least 2 devices in config/oscilloscopes.test.yaml.
 */

import { test, expect } from "./fixtures";

const DEVICE_A = process.env.HW_PRIMARY_DEVICE ?? "scope-01";
const DEVICE_B = process.env.HW_SECONDARY_DEVICE ?? "scope-02";

const token =
  process.env.OPENBIS_TEST_TOKEN ?? process.env.OPENBIS_TOKEN ?? "";
const STORAGE_KEY = "osc_auth_token";

async function injectTokenForContext(context: import("@playwright/test").BrowserContext) {
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: token }
  );
}

test("two users acquire on different devices concurrently", async ({ browser }) => {
  if (!token) test.skip(true, "No token set");

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();

  await injectTokenForContext(ctxA);
  await injectTokenForContext(ctxB);

  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await Promise.all([
    pageA.goto(`/device/${DEVICE_A}`),
    pageB.goto(`/device/${DEVICE_B}`),
  ]);

  // Both lock their respective devices concurrently
  await Promise.all([
    pageA
      .getByRole("button", { name: /Gerät sperren|Lock|Übernehmen/ })
      .click(),
    pageB
      .getByRole("button", { name: /Gerät sperren|Lock|Übernehmen/ })
      .click(),
  ]);

  // Both must show the unlock button (lock succeeded)
  await Promise.all([
    expect(
      pageA.getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
    ).toBeVisible({ timeout: 15_000 }),
    expect(
      pageB.getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
    ).toBeVisible({ timeout: 15_000 }),
  ]);

  // Both acquire concurrently
  await Promise.all([
    pageA.getByRole("button", { name: /Aufnehmen|Acquire|Messen/ }).click(),
    pageB.getByRole("button", { name: /Aufnehmen|Acquire|Messen/ }).click(),
  ]);

  // Both should show a waveform plot within the timeout
  await Promise.all([
    expect(pageA.locator(".js-plotly-plot")).toBeVisible({ timeout: 60_000 }),
    expect(pageB.locator(".js-plotly-plot")).toBeVisible({ timeout: 60_000 }),
  ]);

  // Unlock both
  await Promise.all([
    pageA.getByRole("button", { name: /Freigeben|Unlock|Entsperren/ }).click(),
    pageB.getByRole("button", { name: /Freigeben|Unlock|Entsperren/ }).click(),
  ]);

  await ctxA.close();
  await ctxB.close();
});

test("device list shows all scopes regardless of which user has which lock", async ({
  browser,
}) => {
  if (!token) test.skip(true, "No token set");

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();

  await injectTokenForContext(ctxA);
  await injectTokenForContext(ctxB);

  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // User A locks device A
  await pageA.goto(`/device/${DEVICE_A}`);
  await pageA.getByRole("button", { name: /Gerät sperren|Lock|Übernehmen/ }).click();
  await expect(
    pageA.getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
  ).toBeVisible({ timeout: 15_000 });

  // User B views device list and sees device A as LOCKED, device B as ONLINE
  await pageB.goto("/");
  await expect(pageB.getByText("LOCKED")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText("ONLINE")).toBeVisible({ timeout: 5_000 });

  // Cleanup
  await pageA
    .getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
    .click();
  await ctxA.close();
  await ctxB.close();
});
