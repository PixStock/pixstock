import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * The README's screenshots, drawn from the running apps.
 *
 * A separate config rather than a second project, so that `testMatch` here
 * cannot widen what `npm run test:system` runs. Everything else — the two dev
 * servers, the base URL, the device — is the system suite's, unchanged.
 */
export default defineConfig({
  ...base,
  testMatch: "**/*.shot.ts",
  reporter: "list",
  retries: 0,
});
