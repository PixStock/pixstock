import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * Default run: everything deterministic and offline — unit and integration.
 * It must stay green on any machine, at any time, with no network.
 *
 * Tests that reach a live service are named `*.live.test.ts` and excluded
 * here; `npm run test:live` runs those. A suite that can fail because Jupiter
 * is slow is a suite people learn to ignore.
 *
 * Browser-driven system tests live in `system/` and run under Playwright.
 */
export default defineConfig({
  plugins: [
    // NestJS resolves constructor dependencies from `design:paramtypes`, which
    // esbuild does not emit. Without this the integration tests get undefined
    // where a service should be, and every route answers 500.
    swc.vite({
      module: { type: "es6" },
      jsc: { target: "es2022", parser: { syntax: "typescript", decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } },
    }),
  ],
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.live.test.ts"],
  },
});
