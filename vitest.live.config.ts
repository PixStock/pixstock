import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * Tests that call the real Jupiter API and a real Solana RPC node.
 *
 * They are the ones that would have caught the lookup-table bug: every
 * offline test passed while our transactions were 350 bytes too big, because
 * only a comparison against Jupiter's own output for the same quote made the
 * difference visible.
 *
 * Slow and occasionally flaky by nature. Run them deliberately, before a
 * merge and before the demo — not on every save.
 */
export default defineConfig({
  plugins: [
    // Same reason as the default config: NestJS reads constructor types from
    // `design:paramtypes`, which esbuild does not emit. A live test that
    // builds a testing module would otherwise get undefined services and a
    // baffling failure.
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ["packages/*/test/**/*.live.test.ts", "apps/*/test/**/*.live.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Live routes change between calls; parallel runs make failures harder to read.
    fileParallelism: false,
  },
});
