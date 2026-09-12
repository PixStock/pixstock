import type { Locale } from "./config";

/** Prefixes an app-relative path (e.g. "/mechanic#resolution") with the current locale. */
export function localeHref(locale: Locale, path: string): string {
  if (path === "/") return `/${locale}`;
  return `/${locale}${path}`;
}
