import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Traced output, for the container image.
   *
   * Next works out which files the server actually needs and copies them into
   * `.next/standalone`, which is what lets the runtime stage carry a few tens
   * of megabytes instead of a monorepo's entire node_modules. `outputFileTracingRoot`
   * points at the workspace root, or the trace stops at apps/web and misses
   * every local package.
   */
  output: "standalone",
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,

  /*
   * Builds run on webpack (`--webpack` in the scripts), not Turbopack.
   *
   * Turbopack evaluates PostCSS plugins in a Node sandbox that cannot load
   * native .node addons. Tailwind v4 pulls lightningcss, which is one, so
   * every build dies on `globals.css` with:
   *
   *   Cannot find module '../lightningcss.linux-x64-gnu.node'
   *
   * Verified: plain Node resolves the module fine from this directory, the
   * platform package is installed, and putting the binary at the fallback
   * path does not help — the sandbox simply will not load it. Revisit when
   * Next or Tailwind ships a fix; the flag is the only thing to remove.
   */
};

export default nextConfig;
