import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SiteScript } from "@/components/SiteScript";
import { content } from "@/content/site";
import { SITE_URL } from "@/lib/site-url";

export function generateMetadata(): Metadata {
  const m = content.legal.meta;
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: "/legal" },
    openGraph: { title: m.ogTitle, description: m.description, url: "/legal" },
  };
}

export default function LegalPage() {
  const dict = content;
  const l = dict.legal;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: dict.site.siteName, item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: l.breadcrumbName, item: `${SITE_URL}/legal` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteScript a11y={dict.common} />
      <Header dict={dict} />

      <main id="main">
        <div className="head-spacer" id="head-spacer" />

        <section className="band page-head">
          <div className="shell">
            <p className="eyebrow">{l.pageHead.eyebrow}</p>
            <h1>{l.pageHead.title}</h1>
            <p className="lede">{l.pageHead.lede}</p>
          </div>
        </section>

        <section className="band band--tight">
          <div className="shell prose">
            {l.sections.map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                {section.body.map((line, i) => (
                  <p key={i} className="copy">{line}</p>
                ))}
              </section>
            ))}

            <p className="copy">
              {l.security.text} <a href={l.security.href}>{l.security.label}</a>.
            </p>
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}
