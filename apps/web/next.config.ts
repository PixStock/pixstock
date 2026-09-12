import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
