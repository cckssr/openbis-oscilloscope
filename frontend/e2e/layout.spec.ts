import { expect, test, type Page } from "@playwright/test";
import {
  apiCapture,
  apiLock,
  isTablet,
  layoutOf,
  loginAsDebugUser,
  resetLocks,
  resetScope,
} from "./helpers";
import {
  box,
  closeSettings,
  inspector,
  openAndTake,
  openSettings,
  saveCapture,
  setLevel,
  startLive,
  stopLive,
  zoomPlot,
} from "./ui";

/** True when the page does not scroll horizontally. */
async function fitsHorizontally(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

/** Bounding box of the whole plot region (toolbar, canvas, readouts). */
async function plotRegion(page: Page) {
  const graph = page.locator(".js-plotly-plot").first();
  await expect(graph).toBeVisible();
  const region = graph.locator("xpath=ancestor::div[contains(@class,'@container')][1]");
  return box(region);
}

test.beforeEach(async ({ request }) => {
  await resetLocks();
  await resetScope(request);
});
test.afterEach(resetLocks);

test.describe("no horizontal overflow", () => {
  test("login", async ({ page }) => {
    await page.goto("login");
    await expect(page.getByRole("heading", { name: /Oszilloskop/ })).toBeVisible();
    expect(await fitsHorizontally(page)).toBe(true);
  });

  test("device list", async ({ page }) => {
    await loginAsDebugUser(page);
    await expect(page.getByRole("heading", { name: /Mock Scope/ }).first()).toBeVisible();
    expect(await fitsHorizontally(page)).toBe(true);
  });

  test("control page: free, held and live", async ({ page }) => {
    await loginAsDebugUser(page);
    await page.goto("device/scope-01");
    await expect(page.getByRole("button", { name: /^Gerät übernehmen$/ }).first()).toBeVisible();
    expect(await fitsHorizontally(page)).toBe(true);

    await openAndTake(page);
    expect(await fitsHorizontally(page)).toBe(true);

    await startLive(page);
    expect(await fitsHorizontally(page)).toBe(true);
    await stopLive(page);
  });

  test("control page in Erweitert with settings open", async ({ page }, testInfo) => {
    await loginAsDebugUser(page);
    await openAndTake(page);
    await setLevel(page, "Erweitert");
    await openSettings(page, testInfo, "Trigger");
    expect(await fitsHorizontally(page)).toBe(true);
  });

  test("archive", async ({ page, request }) => {
    await loginAsDebugUser(page);
    const sid = await apiLock(request);
    await apiCapture(request, sid);
    await page.goto(`archive/${sid}`);
    await expect(page.getByRole("table")).toBeVisible();
    expect(await fitsHorizontally(page)).toBe(true);
  });
});

test("the owner button and the archive link stay inside the viewport", async ({ page }) => {
  await loginAsDebugUser(page);
  await openAndTake(page);
  const width = page.viewportSize()!.width;
  for (const target of [
    page.getByRole("button", { name: /^Gerät freigeben$/ }),
    page.getByRole("link", { name: /Messdaten/ }).first(),
    page.getByRole("button", { name: /Messdaten/ }).first(),
  ]) {
    if (!(await target.isVisible())) continue;
    const b = await box(target);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(width);
  }
});

test("A15: trigger controls are not clipped", async ({ page }, testInfo) => {
  await loginAsDebugUser(page);
  await openAndTake(page);
  await setLevel(page, "Erweitert");
  const panel = await openSettings(page, testInfo, "Trigger");
  await expect(panel.locator('[data-control="trigger.slope"]')).toBeVisible();

  const panelBox = await box(inspector(page));
  const groups = panel.locator('[role="radiogroup"]');
  expect(await groups.count()).toBeGreaterThan(0);
  for (const group of await groups.all()) {
    const g = await box(group);
    expect(g.x + g.width, "radiogroup inside inspector").toBeLessThanOrEqual(panelBox.x + panelBox.width + 0.5);
    for (const radio of await group.getByRole("radio").all()) {
      const r = await box(radio);
      expect(r.x, "segment left edge").toBeGreaterThanOrEqual(g.x - 0.5);
      expect(r.x + r.width, "segment right edge").toBeLessThanOrEqual(g.x + g.width + 0.5);
      // The label itself is not cut off (no text overflow inside the button).
      const clipped = await radio.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(clipped, `label of "${await radio.textContent()}" clipped`).toBe(false);
    }
  }
  // Every control of the group sits inside the panel.
  for (const c of await panel.locator("[data-control]").all()) {
    if (!(await c.isVisible())) continue;
    const b = await box(c);
    expect(b.x + b.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 0.5);
  }
  await closeSettings(page, testInfo);
});

test("plot gets its share of the screen", async ({ page }, testInfo) => {
  await loginAsDebugUser(page);
  await openAndTake(page);
  await saveCapture(page);
  const vp = page.viewportSize()!;
  const region = await plotRegion(page);
  const widthShare = region.width / vp.width;
  const heightShare = region.height / vp.height;

  // Known issue: at 1280 px both side panels are open by default, leaving the plot ~52 %.
  test.fail(
    testInfo.project.name === "desktop-1280",
    "plot gets only ~52 % of a 1280 px screen (actions column 260 px + inspector 340 px)",
  );

  switch (layoutOf(testInfo)) {
    case "desktop":
      expect(widthShare, "plot width share on desktop").toBeGreaterThanOrEqual(0.55);
      break;
    case "landscape":
      expect(widthShare, "plot width share on tablet landscape").toBeGreaterThanOrEqual(0.75);
      break;
    case "portrait":
      expect(widthShare, "plot width share on tablet portrait").toBeGreaterThanOrEqual(0.9);
      expect(heightShare, "plot height share on tablet portrait").toBeGreaterThanOrEqual(0.45);
      break;
  }
});

test("main action buttons are at least 40 px tall on tablets", async ({ page }, testInfo) => {
  test.skip(!isTablet(testInfo), "touch targets only matter on the tablet projects");
  await loginAsDebugUser(page);
  await openAndTake(page);
  await saveCapture(page);

  const names = [
    /^Gerät freigeben$/,
    /^(Aufnahme )?speichern$/i,
    /^Live (starten|an)\b/,
    /^Auto/,
    /^Notiz$/,
  ];
  for (const name of names) {
    const button = page.getByRole("button", { name }).first();
    await expect(button, String(name)).toBeVisible();
    const b = await box(button);
    expect(b.height, `height of ${name}`).toBeGreaterThanOrEqual(40);
  }
});

test("archive touch targets: upload button and row checkbox are at least 40 px", async ({
  page,
  request,
}, testInfo) => {
  test.skip(!isTablet(testInfo), "touch targets only matter on the tablet projects");
  await loginAsDebugUser(page);
  const sid = await apiLock(request);
  await apiCapture(request, sid);
  await page.goto(`archive/${sid}`);
  await expect(page.getByRole("table")).toBeVisible();

  const upload = await box(page.getByRole("button", { name: /^Hochladen \(\d+\)$/ }));
  expect(upload.height).toBeGreaterThanOrEqual(40);
  const checkbox = page
    .getByRole("checkbox", { name: /Aufnahme von .* zum Hochladen auswählen/ })
    .first()
    .locator("xpath=ancestor::label[1]");
  const hit = await box(checkbox);
  expect(hit.width).toBeGreaterThanOrEqual(40);
  expect(hit.height).toBeGreaterThanOrEqual(40);
});

test("A16: no Plotly notifier text on the archive page after zooming", async ({ page, request }) => {
  await loginAsDebugUser(page);
  await openAndTake(page);
  const sid = (await (await request.get("http://localhost:8000/devices/scope-01", {
    headers: { Authorization: "Bearer debug-token" },
  })).json()).lock.session_id as string;
  await saveCapture(page);
  await zoomPlot(page);

  await page.goto(`archive/${sid}`);
  await expect(page.getByRole("table")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.locator(".plotly-notifier").count()).toBe(0);
  await expect(page.getByText(/double-click|zoom back out/i)).toHaveCount(0);

  // Zooming inside the preview (split view or dialog) must not leak a notifier either.
  await page.getByRole("button", { name: /^Vorschau \d/ }).first().click();
  await expect(page.locator(".js-plotly-plot").first()).toBeVisible();
  await zoomPlot(page);
  await page.waitForTimeout(500);
  expect(await page.locator(".plotly-notifier").count()).toBe(0);
  await expect(page.getByText(/double-click|zoom back out/i)).toHaveCount(0);
});
