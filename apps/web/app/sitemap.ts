import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

const lastModified = "2026-09-12";
const paths = ["", "/trade", "/basket", "/vault", "/protocol", "/legal"];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path) => ({
    url: `${SITE_URL}${path || "/"}`,
    lastModified,
  }));
}
