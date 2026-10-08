import { expect, test } from "@playwright/test";
import { DEBUG_TOKEN, resetLocks } from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetLocks();
  // Wait for /config: until it arrives the token field is shown, afterwards it
  // moves behind "Erweitert" when openBIS SSO is configured.
  const configLoaded = page.waitForResponse((r) =>
    r.url().includes("/api/config"),
  );
  await page.goto("login");
  await configLoaded;
  const field = page.getByLabel("Sitzungstoken");
  if (!(await field.isVisible())) {
    await page
      .getByRole("button", { name: /Erweitert: Sitzungstoken/ })
      .click();
  }
  await expect(field).toBeVisible();
});

test("wrong token shows an error and stays on the login page", async ({
  page,
}) => {
  await page.getByLabel("Sitzungstoken").fill("definitely-not-valid");
  await page.getByRole("button", { name: "Verbinden" }).click();
  await expect(page.getByRole("alert")).toContainText(
    /Token ungültig|abgelaufen/,
  );
  await expect(page).toHaveURL(/login/);
});

test("debug token logs in and shows the device list", async ({ page }) => {
  await page.getByLabel("Sitzungstoken").fill(DEBUG_TOKEN);
  await page.getByRole("button", { name: "Verbinden" }).click();
  await expect(page).not.toHaveURL(/login/);
  await expect(
    page.getByRole("heading", { name: /Mock Scope/ }).first(),
  ).toBeVisible();
});

test("debug hint is shown because the backend runs in DEBUG mode", async ({
  page,
}) => {
  await expect(page.getByText("Entwicklungsmodus: Token")).toBeVisible();
  await expect(page.locator("code", { hasText: DEBUG_TOKEN })).toBeVisible();
});

test("the submit button stays disabled while the token field is empty", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "Verbinden" })).toBeDisabled();
});
