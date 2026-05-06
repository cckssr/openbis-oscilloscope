/**
 * Shared Playwright fixtures for hardware integration E2E tests.
 *
 * Usage:
 *   import { test, expect } from "./fixtures";
 *
 * The `authenticatedPage` fixture sets localStorage["osc_auth_token"]
 * directly, bypassing the login form. Use `loginPage` when you need to
 * exercise the login form itself.
 */

import { test as base, expect, type Page } from "@playwright/test";

const STORAGE_KEY = "osc_auth_token";

function getToken(): string {
  const token =
    process.env.OPENBIS_TEST_TOKEN ??
    process.env.OPENBIS_TOKEN ??
    "";
  if (!token) {
    throw new Error(
      "OPENBIS_TEST_TOKEN or OPENBIS_TOKEN env var must be set for E2E tests"
    );
  }
  return token;
}

/** Inject the token into localStorage before the page loads. */
async function injectToken(page: Page): Promise<void> {
  const token = getToken();
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: token }
  );
}

type Fixtures = {
  /** Page with the auth token pre-injected — no login form interaction. */
  authenticatedPage: Page;
  /** Raw page (no token injected) — for testing the login flow itself. */
  unauthenticatedPage: Page;
  /** The OpenBIS session token from environment. */
  openbisToken: string;
  /** The writable OpenBIS test space/experiment path. */
  testSpace: string;
};

export const test = base.extend<Fixtures>({
  authenticatedPage: async ({ page }, use) => {
    await injectToken(page);
    await use(page);
  },

  unauthenticatedPage: async ({ page }, use) => {
    await use(page);
  },

  openbisToken: async ({}, use) => {
    await use(getToken());
  },

  testSpace: async ({}, use) => {
    const space =
      process.env.OPENBIS_TEST_SPACE ?? "";
    if (!space) {
      test.skip(true, "OPENBIS_TEST_SPACE env var not set — skipping commit test");
    }
    await use(space);
  },
});

export { expect };
