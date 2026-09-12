import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
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
      <Header dict={dict} current="trade" />

      <main id="main">
        <div className="head-spacer" id="head-spacer" />

        <section className="band page-head">
          <div className="shell">
            <p className="eyebrow">{t.pageHead.eyebrow}</p>
            <h1>{t.pageHead.title}</h1>
            <p className="lede">{t.pageHead.lede}</p>
          </div>
        </section>

        <section className="band band--tight">
          <div className="shell">
            <TradeForm />
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}
