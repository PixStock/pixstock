import type { MetadataRoute } from "next";

const lastModified = "2026-09-12";
const paths = ["", "/trade", "/basket", "/vault", "/protocol", "/legal"];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path) => ({
    url: `https://pixstock.xyz${path || "/"}`,
    lastModified,
  }));
}
