import { expect, test, type Page } from "@playwright/test";
import {
  apiArtifacts,
  apiCapture,
  apiLock,
  API,
  DEBUG_TOKEN,
  DEVICE,
  loginAsDebugUser,
  resetLocks,
  type ApiArtifact,
} from "./helpers";

/** The split view (preview next to the list) is used from 1280 px, narrower it is a dialog. */
const hasSplitView = (width: number) => width >= 1280;

/** Creates a session with `n` captures and opens its archive. */
async function seedArchive(
  page: Page,
  request: Parameters<typeof apiLock>[0],
  n: number,
): Promise<{ sid: string; artifacts: ApiArtifact[] }> {
  const sid = await apiLock(request);
  for (let i = 0; i < n; i++) {
    await apiCapture(request, sid);
  }
  await page.goto(`archive/${sid}`);
  await expect(page.getByRole("table")).toBeVisible();
  return { sid, artifacts: await apiArtifacts(request, sid) };
}

const rowCheckboxes = (page: Page) =>
  page.getByRole("checkbox", {
    name: /Aufnahme von .* zum Hochladen auswählen/,
  });
const previewButtons = (page: Page) =>
  page.getByRole("button", { name: /^Vorschau \d/ });

test.beforeEach(async ({ page }) => {
  await resetLocks();
  await loginAsDebugUser(page);
});
test.afterEach(resetLocks);

test("A13: Escape closes the preview dialog (arrow keys step in the split view)", async ({
  page,
  request,
}) => {
  await seedArchive(page, request, 2);
  const width = page.viewportSize()!.width;
  await previewButtons(page).first().click();

  if (hasSplitView(width)) {
    // Split view: preview sits beside the list; ←/→ step through the captures.
    await expect(page.getByText(/^\d+ von 2$/)).toBeVisible();
    const position = await page.getByText(/^\d+ von 2$/).textContent();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(/^\d+ von 2$/)).not.toHaveText(position!);
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText(/^\d+ von 2$/)).toHaveText(position!);
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Wähle eine Aufnahme aus/)).toBeVisible();
  } else {
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});

test("Alle mit Notiz auswählen selects only the captures that have a note", async ({
  page,
  request,
}) => {
  const { sid } = await seedArchive(page, request, 2);
  const noted = (await apiArtifacts(request, sid)).find(
    (a) => a.acquisition_id,
  )!.acquisition_id!;
  const res = await request.post(
    `${API}/sessions/${sid}/acquisitions/${noted}/annotation`,
    {
      headers: { Authorization: `Bearer ${DEBUG_TOKEN}` },
      data: { annotation: "mit Notiz" },
    },
  );
  expect(res.ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole("table")).toBeVisible();

  await page.getByRole("button", { name: "Alle mit Notiz auswählen" }).click();
  await expect(page.getByText("1 Aufnahme ausgewählt")).toBeVisible();
  await expect(
    page.getByRole("row", { name: /mit Notiz/ }).getByRole("checkbox"),
  ).toBeChecked();
  await expect(
    page.getByRole("row", { name: /Notiz hinzufügen/ }).getByRole("checkbox"),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Alle mit Notiz auswählen" }),
  ).toBeDisabled();
});

test("the preview divider can be dragged in the split view", async ({
  page,
  request,
}) => {
  test.skip(
    !hasSplitView(page.viewportSize()!.width),
    "below 1280 px the preview is a dialog",
  );
  await seedArchive(page, request, 1);
  const preview = page.getByRole("complementary", { name: "Vorschau" });
  const divider = page.getByRole("separator");
  const before = (await preview.boundingBox())!.width;
  const handle = (await divider.boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handle.x - 120, handle.y + handle.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await preview.boundingBox())!.width)
    .toBeGreaterThan(before + 60);
});

test("flagging a capture selects all its traces and enables Hochladen", async ({
  page,
  request,
}) => {
  const { sid } = await seedArchive(page, request, 1);
  const upload = page.getByRole("button", { name: /^Hochladen \(\d+\)$/ });
  await expect(upload).toBeDisabled();

  await rowCheckboxes(page).first().check();
  await expect(
    page.getByText("Zum Hochladen ausgewählt").first(),
  ).toBeVisible();
  await expect(upload).toHaveText(/Hochladen \(1\)/);
  await expect(upload).toBeEnabled();
  await expect
    .poll(async () =>
      (await apiArtifacts(request, sid)).every((a) => a.persist),
    )
    .toBe(true);
});

test("a failing flag request rolls the checkbox back and shows an error toast", async ({
  page,
  request,
}) => {
  const { sid } = await seedArchive(page, request, 1);
  await page.route(
    "**/oscilloscope/api/sessions/*/artifacts/*/flag*",
    (route) =>
      route.fulfill({ status: 500, json: { detail: "forced failure" } }),
  );

  const box = rowCheckboxes(page).first();
  await box.check({ force: true }).catch(() => {});
  await expect(
    page.getByText(/Auswahl (nicht gespeichert|fehlgeschlagen)/).first(),
  ).toBeVisible();
  await expect(box).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: /^Hochladen \(0\)$/ }),
  ).toBeDisabled();
  expect((await apiArtifacts(request, sid)).some((a) => a.persist)).toBe(false);
});

test("A14: after the upload the rows show Hochgeladen and cannot be uploaded twice", async ({
  page,
  request,
}) => {
  const { sid } = await seedArchive(page, request, 1);
  await rowCheckboxes(page).first().check();
  await page.getByRole("button", { name: /^Hochladen \(1\)$/ }).click();

  const wizard = page.getByRole("dialog", { name: /Hochladen nach openBIS/ });
  await expect(wizard).toBeVisible();
  await wizard.getByRole("button", { name: "Weiter", exact: true }).click(); // Auswahl -> Ziel

  // Ziel: the structure list is not available in DEBUG; use the manual identifier.
  const manual = wizard.getByRole("textbox", { name: /Kennung des Versuchs/ });
  if (!(await manual.isVisible())) {
    await wizard
      .getByRole("button", { name: /Kennung manuell eingeben/ })
      .click();
  }
  await manual.fill("/E2E/TEST/EXPERIMENT-1");
  await wizard.getByRole("button", { name: "Weiter", exact: true }).click();

  // Angaben
  await wizard
    .getByRole("combobox", { name: /Praktikum/ })
    .selectOption({ index: 1 });
  await wizard.getByRole("textbox", { name: /Versuchstitel/ }).fill("E2E Test");
  await wizard.getByRole("button", { name: "Weiter", exact: true }).click();

  // Bestätigen -> Ergebnis
  await wizard.getByRole("button", { name: "Jetzt hochladen" }).click();
  await expect(wizard.getByText(/1 Aufnahme hochgeladen/)).toBeVisible({
    timeout: 20_000,
  });
  await wizard
    .getByRole("button", { name: /^(Fertig|Schließen)$/ })
    .first()
    .click();
  await expect(wizard).toBeHidden();

  await expect(page.getByText("Hochgeladen ✓").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Hochladen \(0\)$/ }),
  ).toBeDisabled();
  await expect(rowCheckboxes(page).first()).toBeDisabled();
  await expect
    .poll(async () =>
      (await apiArtifacts(request, sid)).every((a) => a.uploaded),
    )
    .toBe(true);
});

test("Alle als ZIP downloads a zip file", async ({ page, request }) => {
  await seedArchive(page, request, 1);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Alle als ZIP" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

test("Meine Messdaten lists the session and opens its archive", async ({
  page,
  request,
}) => {
  const { sid } = await seedArchive(page, request, 1);
  await page.goto("sessions");
  await expect(
    page.getByRole("heading", { name: "Meine Messdaten" }).first(),
  ).toBeVisible();
  const open = page.locator(`a[href$="/archive/${sid}"]`);
  await expect(open).toBeVisible();
  await expect(
    open.locator("xpath=ancestor::*[self::li or self::tr or self::div][1]"),
  ).toContainText("Aktiv");
  await open.click();
  await expect(page).toHaveURL(new RegExp(`/archive/${sid}$`));
  await expect(page.getByRole("table")).toBeVisible();
});

test("GET /sessions?mine=true lists the session", async ({ request }) => {
  const sid = await apiLock(request);
  const res = await request.get(`${API}/sessions?mine=true`, {
    headers: { Authorization: `Bearer ${DEBUG_TOKEN}` },
  });
  expect(res.ok()).toBe(true);
  const ids = ((await res.json()) as { session_id: string }[]).map(
    (s) => s.session_id,
  );
  expect(ids).toContain(sid);
});

test("after the upload the workflow strip starts over at 'Signal einstellen'", async ({
  page,
  request,
}) => {
  const { sid } = await seedArchive(page, request, 1);
  await rowCheckboxes(page).first().check();
  await page.getByRole("button", { name: /^Hochladen \(1\)$/ }).click();

  const wizard = page.getByRole("dialog", { name: /Hochladen nach openBIS/ });
  await wizard.getByRole("button", { name: "Weiter", exact: true }).click();
  const manual = wizard.getByRole("textbox", { name: /Kennung des Versuchs/ });
  if (!(await manual.isVisible())) {
    await wizard
      .getByRole("button", { name: /Kennung manuell eingeben/ })
      .click();
  }
  await manual.fill("/E2E/TEST/EXPERIMENT-1");
  await wizard.getByRole("button", { name: "Weiter", exact: true }).click();
  await wizard
    .getByRole("combobox", { name: /Praktikum/ })
    .selectOption({ index: 1 });
  await wizard.getByRole("textbox", { name: /Versuchstitel/ }).fill("E2E Test");
  await wizard.getByRole("button", { name: "Weiter", exact: true }).click();
  await wizard.getByRole("button", { name: "Jetzt hochladen" }).click();
  await expect(wizard.getByText(/1 Aufnahme hochgeladen/)).toBeVisible({
    timeout: 20_000,
  });
  await wizard
    .getByRole("button", { name: /^(Fertig|Schließen)$/ })
    .first()
    .click();
  await expect
    .poll(async () =>
      (await apiArtifacts(request, sid)).every((a) => a.uploaded),
    )
    .toBe(true);

  await page.goto(`device/${DEVICE}`);
  await expect(page.locator('[data-step="setup"]')).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.locator('[data-step="upload"]')).toHaveAttribute(
    "data-state",
    "blocked",
  );
});
