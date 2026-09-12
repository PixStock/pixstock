import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
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
      <Header dict={dict} current="basket" />

      <main id="main">
        <div className="head-spacer" id="head-spacer" />

        <section className="band page-head">
          <div className="shell">
            <p className="eyebrow">{b.pageHead.eyebrow}</p>
            <h1>{b.pageHead.title}</h1>
            <p className="lede">{b.pageHead.lede}</p>
          </div>
        </section>

        <section className="band band--tight">
          <div className="shell">
            <BasketBuilder />
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}
