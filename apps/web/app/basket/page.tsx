import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SiteScript } from "@/components/SiteScript";
import { content } from "@/content/site";
import { BasketBuilder } from "./BasketBuilder";

export function generateMetadata(): Metadata {
  const m = content.basket.meta;
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: "/basket" },
    openGraph: { title: m.ogTitle, description: m.description, url: "/basket" },
  };
}

export default function BasketPage() {
  const dict = content;
  const b = dict.basket;

  return (
    <>
      <SiteScript a11y={dict.common} />

      <AppShell
        current="basket"
        eyebrow={b.pageHead.eyebrow}
        title={b.pageHead.title}
        lede={b.pageHead.lede}
        step={1}
      >
        <BasketBuilder />
      </AppShell>
    </>
  );
}
