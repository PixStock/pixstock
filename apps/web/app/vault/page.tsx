import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { SiteScript } from "@/components/SiteScript";
import { content } from "@/content/site";
import { PairingScanner } from "./PairingScanner";
import { VaultBalances } from "./VaultBalances";

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

      <AppShell
        current="vault"
        eyebrow={v.pageHead.eyebrow}
        title={v.pageHead.title}
        lede={v.pageHead.lede}
        step={1}
      >
        <div className="stack-24">
          <div>
            <h2>{v.pairing.title}</h2>
            <p className="copy">{v.pairing.body}</p>
          </div>

          <PairingScanner />

          <div>
            <h2>{v.watchOnly.title}</h2>
            <p className="copy">{v.watchOnly.body}</p>
          </div>

          <VaultBalances />
        </div>
      </AppShell>

      <Footer dict={dict} />
    </>
  );
}
