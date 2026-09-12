import type { MetadataRoute } from "next";

const lastModified = "2026-09-09";
const paths = ["", "/mechanic", "/roadmap", "/faq"];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path) => ({
    url: `https://pixstock.xyz${path || "/"}`,
    lastModified,
  }));
}
