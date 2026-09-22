/**
 * Where this deployment actually answers.
 *
 * `pixstock.xyz` is registered but still parked, so a canonical URL, a
 * sitemap entry or an Open Graph image built on that name resolves to the
 * registrar's page rather than to the site — a shared link would preview as
 * a parking notice. Until the domain points here, these all name the host a
 * judge can open today.
 *
 * `NEXT_PUBLIC_SITE_URL` moves them without a code change, but Next inlines
 * it at build time: set it as a build argument and redeploy, do not restart.
 * No trailing slash — callers add one where a URL needs it.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://web-production-502d1.up.railway.app";
