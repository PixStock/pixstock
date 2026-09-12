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
  test: {
    include: ["packages/*/test/**/*.live.test.ts", "apps/*/test/**/*.live.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Live routes change between calls; parallel runs make failures harder to read.
    fileParallelism: false,
  },
});
