import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  apiArtifacts,
  apiDeviceLock,
  apiLock,
  apiSettings,
  captureCount,
  DEVICE,
  layoutOf,
  loginAsDebugUser,
  resetLocks,
  resetScope,
} from "./helpers";
import {
  backControl,
  closeSettings,
  control,
  expandChannel,
  gotoArchive,
  gotoDevice,
  liveButtons,
  LIVE_START,
  LIVE_STOP,
  openAndTake,
  openSettings,
  plotTraces,
  saveCapture,
  setLevel,
  startLive,
  stopLive,
  toRgb,
  zoomPlot,
} from "./ui";

/** Control session id of the page's lock, read from the backend. */
async function sessionIdOf(
  request: Parameters<typeof apiDeviceLock>[0],
): Promise<string> {
  const lock = await apiDeviceLock(request);
  expect(lock?.session_id).toBeTruthy();
  return lock!.session_id!;
}

/** Opens the capture note field (inline on desktop, via the "Notiz" button elsewhere). */
async function noteInput(page: Page, testInfo: TestInfo) {
  const field = page.locator("#capture-note-input");
  if (layoutOf(testInfo) !== "desktop" && !(await field.isVisible())) {
    await page.getByRole("button", { name: /^Notiz$/ }).click();
  }
  await expect(field).toBeVisible();
  return field;
}

test.beforeEach(async ({ page, request }) => {
  await resetLocks();
  await resetScope(request);
  await loginAsDebugUser(page);
});
test.afterEach(async ({ request }) => {
  await resetLocks();
  await resetScope(request);
});

test("take control and release the device", async ({ page, request }) => {
  await openAndTake(page);
  await expect(page.getByText(/Du steuerst/).first()).toBeVisible();
  expect((await apiDeviceLock(request))?.is_mine).toBe(true);

  // Nothing captured yet, so releasing needs no confirmation.
  await page.getByRole("button", { name: /^Gerät freigeben$/ }).click();
  await expect(
    page.getByRole("button", { name: /^Gerät übernehmen$/ }).first(),
  ).toBeVisible();
  await expect.poll(() => apiDeviceLock(request)).toBeNull();
});

test("A7: the Live toggle never offers start and stop at the same time", async ({
  page,
}) => {
  await openAndTake(page);
  const enabledCount = async (name: RegExp) => {
    const buttons = page.getByRole("button", { name });
    let n = 0;
    for (const b of await buttons.all()) if (await b.isEnabled()) n++;
    return n;
  };
  const exactlyOneEnabled = async () => {
    expect(
      (await enabledCount(LIVE_START)) + (await enabledCount(LIVE_STOP)),
    ).toBe(1);
  };

  await exactlyOneEnabled();
  await startLive(page);
  await exactlyOneEnabled();
  expect(await enabledCount(LIVE_START)).toBe(0);
  // A second click on the same spot stops live instead of starting another run.
  await stopLive(page);
  await exactlyOneEnabled();
  expect(await enabledCount(LIVE_STOP)).toBe(0);
  await expect(liveButtons(page).first()).toBeVisible();
});

test("A5: live for a few seconds stores nothing in the archive", async ({
  page,
  request,
}) => {
  await openAndTake(page);
  const sid = await sessionIdOf(request);
  await startLive(page);
  await page.waitForTimeout(4000);
  await stopLive(page);
  expect(await apiArtifacts(request, sid)).toEqual([]);
});

test("saving a capture puts exactly one Aufnahme into the archive", async ({
  page,
  request,
}) => {
  await openAndTake(page);
  const sid = await sessionIdOf(request);
  await saveCapture(page);
  expect(captureCount(await apiArtifacts(request, sid))).toBe(1);

  await gotoArchive(page);
  await expect(page.getByText(/1 Aufnahme\b/).first()).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(3); // header, day group, capture
  await expect(page.getByText("Lokal").first()).toBeVisible();
});

test("A4: a note typed while live runs is not wiped", async ({
  page,
  request,
}, testInfo) => {
  await openAndTake(page);
  const sid = await sessionIdOf(request);
  await saveCapture(page);
  await startLive(page);

  const text = "Resonanz bei 1 kHz";
  const field = await noteInput(page, testInfo);
  await field.click();
  await field.pressSequentially(text, { delay: 120 });
  await expect(field).toHaveValue(text);
  await page.waitForTimeout(1200); // several live frames later
  await expect(field).toHaveValue(text);

  await field.press("Enter");
  await expect
    .poll(
      async () =>
        (await apiArtifacts(request, sid)).find((a) => a.annotation)
          ?.annotation,
    )
    .toBe(text);
});

test("A6: toggling a channel shows the applied status and the next capture follows it", async ({
  page,
  request,
}, testInfo) => {
  await openAndTake(page);
  const sid = await sessionIdOf(request);
  const panel = await openSettings(page, testInfo, "Kanäle");

  const ch3 = control(panel, "channels.3.enabled");
  await ch3.getByRole("switch").click();
  await expect(ch3).toContainText("übernommen");
  await expect
    .poll(async () => (await apiSettings(request)).channels["3"].enabled)
    .toBe(false);
  await closeSettings(page, testInfo);

  await saveCapture(page);
  const channels = (await apiArtifacts(request, sid))
    .map((a) => a.channel)
    .sort();
  expect(channels).toEqual([1, 2, 4]);
});

test("A1: typing a negative trigger level is committed as typed", async ({
  page,
  request,
}, testInfo) => {
  await openAndTake(page);
  await setLevel(page, "Erweitert");
  const panel = await openSettings(page, testInfo, "Trigger");
  const input = control(panel, "trigger.level_v").getByRole("textbox");

  await input.click();
  await input.press("ControlOrMeta+a");
  await input.pressSequentially("-0,5");
  await input.press("Enter");

  await expect
    .poll(async () => (await apiSettings(request)).trigger.level_v)
    .toBe(-0.5);
  await expect(input).toHaveValue(/(500 ?m|0,5)/);
  await expect(input).not.toHaveValue(/^0+[.,]5/);
});

test("A2: V/div steps through 1-2-5 below 0.5", async ({
  page,
  request,
}, testInfo) => {
  await openAndTake(page);
  await setLevel(page, "Erweitert");
  const panel = await openSettings(page, testInfo, "Kanäle");
  await expandChannel(panel, 1);
  const scale = control(panel, "channels.1.scale_v_div");

  for (const expected of [0.5, 0.2, 0.1, 0.05]) {
    await scale.getByRole("button", { name: /verringern/ }).click();
    await expect
      .poll(async () => (await apiSettings(request)).channels["1"].scale_v_div)
      .toBeCloseTo(expected, 10);
  }
});

test("A3: offset steps do not accumulate float noise", async ({
  page,
  request,
}, testInfo) => {
  await openAndTake(page);
  await setLevel(page, "Erweitert");
  const panel = await openSettings(page, testInfo, "Kanäle");
  await expandChannel(panel, 1);
  const offset = control(panel, "channels.1.offset_v");

  for (let i = 0; i < 3; i++)
    await offset.getByRole("button", { name: /erhöhen/ }).click();
  await expect
    .poll(async () => (await apiSettings(request)).channels["1"].offset_v)
    .toBe(0.3);
  await expect(offset.getByRole("textbox")).not.toHaveValue(/0000|9999/);
});

test("A8: the plot trace colours equal the channel chips of the settings", async ({
  page,
}, testInfo) => {
  await openAndTake(page);
  await saveCapture(page);
  await expect
    .poll(async () => (await plotTraces(page)).length)
    .toBeGreaterThanOrEqual(4);
  const traces = await plotTraces(page);

  const panel = await openSettings(page, testInfo, "Kanäle");
  for (let ch = 1; ch <= 4; ch++) {
    const chip = panel
      .locator(`[data-channel="${ch}"] span[aria-hidden]`)
      .first();
    const chipColor = await chip.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    );
    const trace = traces.find((t) => new RegExp(`CH${ch}\\b`).test(t.name));
    expect(
      trace,
      `plot trace for CH${ch} in ${JSON.stringify(traces)}`,
    ).toBeTruthy();
    expect(await toRgb(page, trace!.color)).toBe(chipColor);
  }
});

test("A9: the timebase readout reads 1 µs/div, not 999 ns/div", async ({
  page,
  request,
}) => {
  await resetScope(request, { timebase: 1e-6 });
  await openAndTake(page);
  await saveCapture(page);
  await expect(page.getByText(/1 µs\/div/).first()).toBeVisible();
  await expect(page.getByText(/999 ns/)).toHaveCount(0);
});

test("A10: archive and back keeps the plot and the lock", async ({ page }) => {
  await openAndTake(page);
  await saveCapture(page);
  await expect
    .poll(async () => (await plotTraces(page)).length)
    .toBeGreaterThan(0);

  await gotoArchive(page);
  await backControl(page, "Zurück zur Steuerung").click();
  await expect(page).toHaveURL(new RegExp(`/device/${DEVICE}$`));

  await expect(
    page.getByRole("button", { name: /^Gerät freigeben$/ }),
  ).toBeVisible();
  await expect
    .poll(async () => (await plotTraces(page)).length)
    .toBeGreaterThan(0);
  await expect(page.getByTestId("plot-empty-hint")).toHaveCount(0);
});

test("A11: reloading the page keeps control", async ({ page, request }) => {
  await openAndTake(page);
  const sid = await sessionIdOf(request);
  await saveCapture(page);

  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Gerät freigeben$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Gerät übernehmen$/ }),
  ).toHaveCount(0);
  expect((await apiDeviceLock(request))?.session_id).toBe(sid);
  // The newest capture comes back into the plot.
  await expect
    .poll(async () => (await plotTraces(page)).length)
    .toBeGreaterThan(0);
});

test("A12: a second tab on the same device is passive and can take over", async ({
  page,
  context,
}) => {
  await openAndTake(page);

  const second = await context.newPage();
  await second.goto(`device/${DEVICE}`);
  await expect(second.getByText(/bereits in einem anderen Tab/)).toBeVisible();
  const takeHere = second.getByRole("button", { name: "Hier übernehmen" });
  await expect(takeHere).toBeVisible();
  await expect(
    second.getByRole("button", { name: /^Gerät freigeben$/ }),
  ).toHaveCount(0);

  await takeHere.click();
  await expect(
    second.getByRole("button", { name: /^Gerät freigeben$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hier übernehmen" }),
  ).toBeVisible();
  await second.close();
});

test("release guard warns about captures that are not uploaded", async ({
  page,
  request,
}) => {
  await openAndTake(page);
  await saveCapture(page);

  const release = page.getByRole("button", { name: /^Gerät freigeben$/ });
  await release.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/1 Aufnahme ist noch nicht hochgeladen/);

  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(dialog).toBeHidden();
  await expect(release).toBeVisible();
  expect((await apiDeviceLock(request))?.is_mine).toBe(true);

  await release.click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Trotzdem freigeben" })
    .click();
  await expect(
    page.getByRole("button", { name: /^Gerät übernehmen$/ }).first(),
  ).toBeVisible();
  await expect.poll(() => apiDeviceLock(request)).toBeNull();
  // The plot stays after release.
  expect((await plotTraces(page)).length).toBeGreaterThan(0);
});

test("release guard offers to go to the upload", async ({ page }) => {
  await openAndTake(page);
  await saveCapture(page);
  await page.getByRole("button", { name: /^Gerät freigeben$/ }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Jetzt hochladen" })
    .click();
  await expect(page).toHaveURL(/\/archive\//);
});

test("full resolution: Abbrechen during the read stores nothing", async ({
  page,
  request,
}) => {
  await openAndTake(page);
  const sid = await sessionIdOf(request);

  await page.getByRole("button", { name: "Weitere Aufnahmearten" }).click();
  await page.getByRole("menuitem", { name: /Volle Auflösung/ }).click();
  const dialog = page.getByRole("dialog", { name: /Volle Auflösung/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Weiter" }).click();
  await dialog.getByRole("button", { name: "Lesen starten" }).click();

  await expect(dialog.getByRole("progressbar")).toBeVisible();
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(dialog).toContainText(/Abgebrochen/);
  await expect(dialog).toContainText(/nichts gespeichert/);
  expect(await apiArtifacts(request, sid)).toEqual([]);
});

test("the note field takes focus after a capture (desktop)", async ({
  page,
}, testInfo) => {
  test.skip(
    layoutOf(testInfo) !== "desktop",
    "tablets open the note in a sheet",
  );
  await openAndTake(page);
  await saveCapture(page);
  await expect(page.locator("#capture-note-input")).toBeFocused();
  // Escape leaves the field again, so the single-key shortcuts work.
  await page.keyboard.press("Escape");
  await expect(page.locator("#capture-note-input")).not.toBeFocused();
});

test("taking a second device asks first; 'Abbrechen' and 'Beide behalten'", async ({
  page,
  request,
}) => {
  await apiLock(request, "scope-01");
  await gotoDevice(page, "scope-02");
  await page
    .getByRole("button", { name: /^Gerät übernehmen$/ })
    .first()
    .click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/Du steuerst bereits ein anderes Gerät/);
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(dialog).toBeHidden();
  expect(await apiDeviceLock(request, "scope-02")).toBeNull();

  await page
    .getByRole("button", { name: /^Gerät übernehmen$/ })
    .first()
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Beide behalten" })
    .click();
  await expect(
    page.getByRole("button", { name: /^Gerät freigeben$/ }),
  ).toBeVisible();
  expect((await apiDeviceLock(request, "scope-01"))?.is_mine).toBe(true);
  expect((await apiDeviceLock(request, "scope-02"))?.is_mine).toBe(true);
});

test("taking a second device can release the first one", async ({
  page,
  request,
}) => {
  await apiLock(request, "scope-01");
  await gotoDevice(page, "scope-02");
  await page
    .getByRole("button", { name: /^Gerät übernehmen$/ })
    .first()
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Anderes freigeben und übernehmen" })
    .click();
  await expect(
    page.getByRole("button", { name: /^Gerät freigeben$/ }),
  ).toBeVisible();
  expect((await apiDeviceLock(request, "scope-02"))?.is_mine).toBe(true);
  expect(await apiDeviceLock(request, "scope-01")).toBeNull();
});

test("Achsen anpassen stays applied while live frames arrive until the user zooms", async ({
  page,
}) => {
  await openAndTake(page);
  await startLive(page);
  const xRange = () =>
    page.evaluate(() => {
      const el = document.querySelector(".js-plotly-plot") as
        (HTMLElement & { _fullLayout?: { xaxis: { range: number[] } } }) | null;
      return el?._fullLayout?.xaxis.range ?? [];
    });
  await expect
    .poll(async () => (await plotTraces(page)).length)
    .toBeGreaterThan(0);

  await zoomPlot(page);
  await expect
    .poll(async () => Math.abs((await xRange())[1] - (await xRange())[0]))
    .toBeGreaterThan(0);
  const zoomed = await xRange();

  const fit = page.getByRole("button", { name: "Achsen anpassen" });
  await fit.click();
  await expect(fit).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => Math.abs((await xRange())[1] - (await xRange())[0]))
    .toBeGreaterThan(Math.abs(zoomed[1] - zoomed[0]) * 1.5);
  const fitted = await xRange();

  await page.waitForTimeout(1500); // several live frames
  await expect(fit).toHaveAttribute("aria-pressed", "true");
  expect(await xRange()).toEqual(fitted);

  await zoomPlot(page);
  await expect(fit).toHaveAttribute("aria-pressed", "false");
  await stopLive(page);
});

test("a collapsed actions column keeps the buttons as icons (desktop)", async ({
  page,
}, testInfo) => {
  test.skip(
    layoutOf(testInfo) !== "desktop",
    "only the desktop layout has a collapsible column",
  );
  await openAndTake(page);
  await page.getByRole("button", { name: "Aktionen einklappen" }).click();
  await expect(
    page.getByRole("button", { name: "Aktionen ausklappen" }),
  ).toBeVisible();

  const save = page.getByTestId("capture-save");
  await expect(save).toBeVisible();
  expect((await save.boundingBox())!.width).toBeLessThan(48);
  await expect(page.getByRole("button", { name: LIVE_START })).toBeVisible();

  await saveCapture(page);
  await startLive(page);
  await stopLive(page);
});
