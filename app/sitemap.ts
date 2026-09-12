import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";

const lastModified = "2026-09-09";
const paths = ["", "/mechanic", "/roadmap", "/faq"];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.flatMap((path) =>
    locales.map((locale) => ({
      url: `https://pixstock.xyz/${locale}${path}`,
      lastModified,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `https://pixstock.xyz/${l}${path}`])
        ),
      },
    }))
  );
}
