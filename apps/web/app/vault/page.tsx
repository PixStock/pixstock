import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SiteScript } from "@/components/SiteScript";
import { content } from "@/content/site";
import { PairingScanner } from "./PairingScanner";

export function generateMetadata(): Metadata {
  const m = content.vault.meta;
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: "/vault" },
    openGraph: { title: m.ogTitle, description: m.description, url: "/vault" },
  };
}

export default function VaultPage() {
  const dict = content;
  const v = dict.vault;

  return (
    <>
      <SiteScript a11y={dict.common} />
      <Header dict={dict} current="vault" />

      <main id="main">
        <div className="head-spacer" id="head-spacer" />

        <section className="band page-head">
          <div className="shell">
            <p className="eyebrow">{v.pageHead.eyebrow}</p>
            <h1>{v.pageHead.title}</h1>
            <p className="lede">{v.pageHead.lede}</p>
          </div>
        </section>

        <section className="band band--tight">
          <div className="shell stack-24">
            <div>
              <h2>{v.pairing.title}</h2>
              <p className="copy">{v.pairing.body}</p>
            </div>

            <PairingScanner />

            <div>
              <h2>{v.watchOnly.title}</h2>
              <p className="copy">{v.watchOnly.body}</p>
            </div>
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}
