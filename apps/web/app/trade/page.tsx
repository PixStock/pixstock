import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SiteScript } from "@/components/SiteScript";
import { content } from "@/content/site";
import { TradeForm } from "./TradeForm";

export function generateMetadata(): Metadata {
  const m = content.trade.meta;
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: "/trade" },
    openGraph: { title: m.ogTitle, description: m.description, url: "/trade" },
  };
}

export default function TradePage() {
  const dict = content;
  const t = dict.trade;

  return (
    <>
      <SiteScript a11y={dict.common} />

      <AppShell
        current="trade"
        eyebrow={t.pageHead.eyebrow}
        title={t.pageHead.title}
        lede={t.pageHead.lede}
        step={1}
      >
        <TradeForm />
      </AppShell>
    </>
  );
}
