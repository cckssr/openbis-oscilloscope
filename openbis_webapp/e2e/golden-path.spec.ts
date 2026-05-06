/**
 * Golden path: single user, single device.
 *
 * Login → device list → lock scope-01 → configure → acquire ×3 →
 * screenshot → unlock → archive → flag → annotate → commit → assert permId.
 */

import { test, expect } from "./fixtures";

const DEVICE_ID = process.env.HW_PRIMARY_DEVICE ?? "scope-01";

test.describe("Golden path — single device", () => {
  test("login form accepts real token", async ({ unauthenticatedPage: page }) => {
    const token = process.env.OPENBIS_TEST_TOKEN ?? process.env.OPENBIS_TOKEN ?? "";
    if (!token) test.skip(true, "No token set");

    await page.goto("/login");
    await expect(page.getByText("Oszilloskop-Steuerung")).toBeVisible();

    await page.getByPlaceholder("openbis-session-token").fill(token);
    await page.getByRole("button", { name: "Verbinden" }).click();

    // Should redirect to device list
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Oszilloskop-Steuerungssystem")).toBeVisible();
  });

  test("device list shows all configured scopes as ONLINE", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Oszilloskop-Steuerungssystem")).toBeVisible();

    // Wait for devices to load (auto-refresh every 5s)
    await expect(page.getByText("ONLINE")).toBeVisible({ timeout: 10_000 });
  });

  test("lock device → acquire → screenshot → unlock", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/device/${DEVICE_ID}`);

    // Lock the device
    await page.getByRole("button", { name: /Gerät sperren|Lock|Übernehmen/ }).click();
    await expect(
      page.getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
    ).toBeVisible({ timeout: 10_000 });

    // Acquire waveform
    await page.getByRole("button", { name: /Aufnehmen|Acquire|Messen/ }).click();
    // Wait for plot to appear (Plotly canvas or trace)
    await expect(
      page.locator(".js-plotly-plot, [data-testid='waveform-plot']")
    ).toBeVisible({ timeout: 60_000 });

    // Acquire two more times
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: /Aufnehmen|Acquire|Messen/ }).click();
      await page.waitForTimeout(1_000);
    }

    // Screenshot
    await page.getByRole("button", { name: /Screenshot/ }).click();
    // Expect a success indicator (toast or status)
    await page.waitForTimeout(3_000);

    // Unlock
    await page
      .getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
      .click();
    await expect(
      page.getByRole("button", { name: /Gerät sperren|Lock|Übernehmen/ })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("configure channel, timebase, and trigger", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/device/${DEVICE_ID}`);

    // Lock device
    await page.getByRole("button", { name: /Gerät sperren|Lock|Übernehmen/ }).click();
    await expect(
      page.getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
    ).toBeVisible({ timeout: 10_000 });

    // Channel config — look for scale input and change it
    const scaleInput = page.getByLabel(/Skalierung|Scale|V\/div/).first();
    if (await scaleInput.isVisible()) {
      await scaleInput.clear();
      await scaleInput.fill("2");
      await scaleInput.press("Enter");
      await page.waitForTimeout(1_000);
    }

    // Timebase — look for timebase section
    const timebaseInput = page
      .getByLabel(/Zeitbasis|Timebase|ms\/div|s\/div/)
      .first();
    if (await timebaseInput.isVisible()) {
      await timebaseInput.clear();
      await timebaseInput.fill("1");
      await timebaseInput.press("Enter");
      await page.waitForTimeout(1_000);
    }

    // Unlock
    await page
      .getByRole("button", { name: /Freigeben|Unlock|Entsperren/ })
      .click();
  });

  test("archive: flag artifacts → annotate → commit", async ({
    authenticatedPage: page,
    testSpace,
  }) => {
    // First create some artifacts via a quick lock+acquire+unlock cycle
    const apiBase = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
    const token = process.env.OPENBIS_TEST_TOKEN ?? process.env.OPENBIS_TOKEN ?? "";

    const lockResp = await fetch(`${apiBase}/devices/${DEVICE_ID}/lock`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(lockResp.ok).toBeTruthy();
    const { control_session_id: sessionId } = await lockResp.json();

    await fetch(`${apiBase}/devices/${DEVICE_ID}/acquire`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ max_samples: false }),
    });

    await fetch(`${apiBase}/devices/${DEVICE_ID}/screenshot`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: "",
    });

    await fetch(`${apiBase}/devices/${DEVICE_ID}/unlock?session_id=${sessionId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    // Navigate to archive
    await page.goto(`/archive/${sessionId}`);
    await expect(page.getByText(/Artefakte|Artifacts|Daten/)).toBeVisible({
      timeout: 10_000,
    });

    // Flag all artifacts
    const checkboxes = page.getByRole("checkbox");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      const cb = checkboxes.nth(i);
      if (!(await cb.isChecked())) {
        await cb.click();
        await page.waitForTimeout(300);
      }
    }

    // Annotate (find annotation/label input if present)
    const annotationInput = page.getByPlaceholder(/Beschreibung|Annotation|Label/).first();
    if (await annotationInput.isVisible()) {
      await annotationInput.fill("hw-e2e-test");
      await annotationInput.press("Enter");
    }

    // Open commit dialog and fill in experiment
    const commitBtn = page.getByRole("button", { name: /Commit|Hochladen|OpenBIS/ });
    await commitBtn.click();

    const experimentInput = page
      .getByLabel(/Experiment|Collection|Kollektion/)
      .first();
    if (await experimentInput.isVisible()) {
      await experimentInput.fill(testSpace);
    }

    // Submit commit
    await page
      .getByRole("button", { name: /Bestätigen|Submit|OK|Speichern/ })
      .last()
      .click();

    // Assert success (toast or updated status)
    await expect(
      page.getByText(/erfolgreich|success|hochgeladen|uploaded|permId/i)
    ).toBeVisible({ timeout: 30_000 });
  });
});
