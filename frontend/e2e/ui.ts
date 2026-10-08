import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { DEVICE, layoutOf } from "./helpers";

/*
 * Page helpers for the control page. Locators are role/label based and use
 * regexes that tolerate small wording changes (e.g. "Live starten" / "Live an").
 */

/** Live toggle in its "off" state ("Live starten", rail: "Live an"). */
export const LIVE_START = /Live (starten|an)\b/;
/** Live toggle in its "on" state ("Live stoppen", rail: "Live aus"). */
export const LIVE_STOP = /Live (stoppen|aus)\b/;

/**
 * Opens the control page of a device and waits until the owner button shows.
 * @param page - The Playwright page
 * @param deviceId - Device id
 */
export async function gotoDevice(page: Page, deviceId = DEVICE): Promise<void> {
  await page.goto(`device/${deviceId}`);
  await expect(ownerButton(page)).toBeVisible();
}

/**
 * The header's take/release button (whichever is shown).
 * @param page - The Playwright page
 * @returns Locator for "Gerät übernehmen" / "Gerät freigeben"
 */
export function ownerButton(page: Page): Locator {
  return page.getByRole("button", { name: /^Gerät (übernehmen|freigeben)$/ }).first();
}

/**
 * Takes control through the header button and waits for the held state.
 * @param page - The Playwright page
 */
export async function takeControl(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Gerät übernehmen$/ }).first().click();
  await expect(page.getByRole("button", { name: /^Gerät freigeben$/ })).toBeVisible();
}

/**
 * Opens the device page and takes control.
 * @param page - The Playwright page
 * @param deviceId - Device id
 */
export async function openAndTake(page: Page, deviceId = DEVICE): Promise<void> {
  await gotoDevice(page, deviceId);
  await takeControl(page);
}

/**
 * Switches the "Einfach / Erweitert" level.
 * @param page - The Playwright page
 * @param level - Target level
 */
export async function setLevel(page: Page, level: "Einfach" | "Erweitert"): Promise<void> {
  const radio = page.getByRole("radio", { name: level });
  await radio.click();
  await expect(radio).toHaveAttribute("aria-checked", "true");
}

/**
 * The "Aufnahme speichern" button (rail: "Speichern").
 * @param page - The Playwright page
 * @returns The locator
 */
export function saveButton(page: Page): Locator {
  return page.getByRole("button", { name: /^(Aufnahme )?speichern$/i }).first();
}

/**
 * Saves a capture and waits for the confirmation toast.
 * @param page - The Playwright page
 * @returns The capture number from the toast ("Aufnahme #3 gespeichert" gives 3)
 */
export async function saveCapture(page: Page): Promise<number> {
  await saveButton(page).click();
  const toast = page.getByText(/Aufnahme #\d+ gespeichert/).first();
  await expect(toast).toBeVisible({ timeout: 15_000 });
  const text = (await toast.textContent()) ?? "";
  return Number(/#(\d+)/.exec(text)?.[1] ?? 0);
}

/**
 * Locator of the visible Live toggle button(s) in either state.
 * @param page - The Playwright page
 * @returns Locator matching the start and the stop state
 */
export function liveButtons(page: Page): Locator {
  return page.getByRole("button", { name: new RegExp(`${LIVE_START.source}|${LIVE_STOP.source}`) });
}

/**
 * Starts live and waits for the LIVE badge.
 * @param page - The Playwright page
 */
export async function startLive(page: Page): Promise<void> {
  await page.getByRole("button", { name: LIVE_START }).first().click();
  await expect(page.getByRole("button", { name: LIVE_STOP }).first()).toBeVisible();
  await expect(page.getByText(/^LIVE$/).first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Stops live and waits until the start button is back.
 * @param page - The Playwright page
 */
export async function stopLive(page: Page): Promise<void> {
  await page.getByRole("button", { name: LIVE_STOP }).first().click();
  await expect(page.getByRole("button", { name: LIVE_START }).first()).toBeVisible();
}

/**
 * Locator of the settings inspector (inline on desktop, inside the sheet on tablets).
 * @param page - The Playwright page
 * @returns The inspector region
 */
export function inspector(page: Page): Locator {
  return page.getByRole("region", { name: "Geräteeinstellungen" }).first();
}

/**
 * Makes the settings of one group reachable and returns the inspector. Desktop:
 * the inline tabs. Landscape: the rail icon opens a sheet on that group.
 * Portrait: the "Einstellungen" button opens a sheet with an accordion.
 * @param page - The Playwright page
 * @param testInfo - Running test (selects the layout)
 * @param group - Group label ("Kanäle", "Zeitbasis", "Trigger")
 * @returns The inspector region
 */
export async function openSettings(
  page: Page,
  testInfo: TestInfo,
  group: "Kanäle" | "Zeitbasis" | "Trigger" = "Kanäle",
): Promise<Locator> {
  const layout = layoutOf(testInfo);
  const panel = inspector(page);
  if (layout === "landscape") {
    await page.getByRole("button", { name: group, exact: true }).click();
  } else if (layout === "portrait") {
    await page.getByRole("button", { name: /^Einstellungen$/ }).click();
  }
  await expect(panel).toBeVisible();
  await waitUntilStill(panel); // sheets slide in; measure only after the animation
  if (layout === "desktop") {
    // A single group (level "Einfach") renders without tabs.
    const tab = panel.getByRole("tab", { name: group });
    if ((await tab.count()) > 0) await tab.click();
  } else if (layout === "portrait") {
    const header = panel.getByRole("button", { name: new RegExp(`^${group}`) }).first();
    if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  }
  return panel;
}

/**
 * Closes the settings sheet on tablets (no-op on desktop).
 * @param page - The Playwright page
 * @param testInfo - Running test
 */
export async function closeSettings(page: Page, testInfo: TestInfo): Promise<void> {
  if (layoutOf(testInfo) === "desktop") return;
  await page.keyboard.press("Escape");
  await expect(inspector(page)).toBeHidden();
}

/**
 * Finds a settings control by its setting path (`data-control`).
 * @param panel - The inspector region
 * @param path - e.g. `channels.1.scale_v_div` or `trigger.level_v`
 * @returns The control wrapper
 */
export function control(panel: Locator, path: string): Locator {
  return panel.locator(`[data-control="${path}"]`).first();
}

/**
 * Expands a channel section of the inspector when it is collapsed.
 * @param panel - The inspector region
 * @param channel - 1-based channel number
 */
export async function expandChannel(panel: Locator, channel: number): Promise<void> {
  const trigger = panel.getByRole("button", { name: new RegExp(`^CH${channel} .*(ein|aus)`) });
  const header = trigger.first();
  if ((await header.count()) > 0 && (await header.getAttribute("aria-expanded")) === "false") {
    await header.click();
  }
}

/**
 * Opens the archive of the current session through the header link.
 * @param page - The Playwright page
 */
export async function gotoArchive(page: Page): Promise<void> {
  await page.getByRole("link", { name: /Messdaten/ }).first().click();
  await expect(page).toHaveURL(/\/archive\//);
}

/**
 * Reads the plotly graph div's traces (`name`, line colour, point count).
 * @param page - The Playwright page
 * @returns One entry per trace
 */
export async function plotTraces(
  page: Page,
): Promise<{ name: string; color: string; points: number }[]> {
  return page.evaluate(() => {
    const el = document.querySelector(".js-plotly-plot") as
      | (HTMLElement & { data?: { name?: string; line?: { color?: string }; x?: ArrayLike<number> }[] })
      | null;
    return (el?.data ?? []).map((d) => ({
      name: d.name ?? "",
      color: d.line?.color ?? "",
      points: d.x?.length ?? 0,
    }));
  });
}

/**
 * Normalises any CSS colour to `rgb(r, g, b)` using the browser.
 * @param page - The Playwright page
 * @param color - CSS colour string
 * @returns The computed rgb string
 */
export async function toRgb(page: Page, color: string): Promise<string> {
  return page.evaluate((c) => {
    const el = document.createElement("span");
    el.style.color = c;
    document.body.appendChild(el);
    const out = getComputedStyle(el).color;
    el.remove();
    return out;
  }, color);
}

/**
 * The "back" control of a page header (a link or a button, depending on the page).
 * @param page - The Playwright page
 * @param name - Accessible name, e.g. "Zurück zur Steuerung"
 * @returns The locator
 */
export function backControl(page: Page, name: string | RegExp): Locator {
  return page.getByRole("link", { name }).or(page.getByRole("button", { name })).first();
}

/**
 * Bounding box of a locator that must be rendered.
 * @param locator - Visible element
 * @returns Its box in viewport coordinates
 */
export async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no bounding box");
  return b;
}

/**
 * Drag-zooms into the plot (switches to "Zoom" mode first).
 * @param page - The Playwright page
 */
export async function zoomPlot(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Zoom$/ }).first().click();
  const drag = page.locator(".js-plotly-plot .nsewdrag").first();
  const b = await box(drag);
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6, { steps: 6 });
  await page.mouse.up();
}

/**
 * Waits until an element stops moving (e.g. a sheet finished sliding in).
 * @param locator - The element
 */
export async function waitUntilStill(locator: Locator): Promise<void> {
  let last = "";
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await locator.boundingBox());
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [100, 100, 150] },
    )
    .toBe(true);
}
