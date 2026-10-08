import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests against the DEBUG backend (mock scopes, no Redis,
 * token `debug-token`) at the four supported viewports (review §5.6).
 *
 * Both servers are started automatically unless already running. The backend
 * Python can be overridden with BACKEND_PYTHON (e.g. ../.venv/bin/python).
 */
const python = process.env.BACKEND_PYTHON ?? "python";

const viewports = {
  "desktop-1440": { width: 1440, height: 900 },
  "desktop-1280": { width: 1280, height: 800 },
  "tablet-landscape": { width: 1024, height: 768 },
  "tablet-portrait": { width: 768, height: 1024 },
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Specs share the mock scopes on one backend; run serially.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5173/oscilloscope/",
    trace: "retain-on-failure",
  },
  projects: Object.entries(viewports).map(([name, viewport]) => ({
    name,
    use: {
      ...devices["Desktop Chrome"],
      viewport,
      hasTouch: name.startsWith("tablet"),
    },
  })),
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port 8000`,
      cwd: "../backend",
      env: { DEBUG: "True", BUFFER_DIR: "./buffer-e2e" },
      url: "http://localhost:8000/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://localhost:5173/oscilloscope/",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
