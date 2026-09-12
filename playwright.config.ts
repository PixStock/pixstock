import { defineConfig, devices } from "@playwright/test";

/**
 * System tests: the apps running, driven through a browser.
 *
 * They cover what no unit or integration test can — that the two apps, built
 * from the real packages, actually complete the demo path a judge will follow.
 * The optical channel is driven through the glued channel rather than a
 * camera, which is the same code path and is also how someone with a single
 * device follows the flow.
 */
export default defineConfig({
  testDir: "./system",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    // The vault is the app under test here; the web app is reached by URL.
    baseURL: "http://localhost:5183",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "npm run dev -w @pixstock/web",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev -w @pixstock/vault",
      url: "http://localhost:5183",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
