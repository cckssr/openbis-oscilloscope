import { defineConfig, devices } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const FRONTEND_PORT = 5173;
const FRONTEND_URL = process.env.FRONTEND_URL ?? `http://localhost:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,

  // Single worker: device lock tests would race if run in parallel
  workers: 1,

  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  use: {
    baseURL: FRONTEND_URL,
    // Capture trace on first retry so failures are diagnosable
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start both the Vite frontend and the FastAPI backend before running tests.
  // Set SKIP_WEBSERVER=1 if you prefer to start them manually.
  webServer: process.env.SKIP_WEBSERVER
    ? undefined
    : [
        {
          // FastAPI backend
          command: "uvicorn app.main:app --reload --port 8000",
          url: `${BACKEND_URL}/health`,
          reuseExistingServer: true,
          timeout: 30_000,
          cwd: "..",
          env: {
            OSCILLOSCOPES_CONFIG: process.env.OSCILLOSCOPES_CONFIG ?? "config/oscilloscopes.test.yaml",
            OPENBIS_URL: process.env.OPENBIS_URL ?? "",
            DEBUG: process.env.DEBUG ?? "false",
          },
        },
        {
          // Vite frontend
          command: "npm run dev",
          url: FRONTEND_URL,
          reuseExistingServer: true,
          timeout: 30_000,
        },
      ],
});
