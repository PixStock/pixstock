import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SiteScript } from "@/components/SiteScript";
import { content } from "@/content/site";

export function generateMetadata(): Metadata {
  const dict = content;
  const m = dict.faq.meta;

  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: "/faq" },
    openGraph: {
      title: m.ogTitle,
      description: m.description,
      url: "/faq",
    },
  };
}

export default function FaqPage() {
  const dict = content;
  const faq = dict.faq;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.qa.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a.join(" ") },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: dict.site.siteName, item: `https://pixstock.xyz/` },
      { "@type": "ListItem", position: 2, name: faq.breadcrumbName, item: `https://pixstock.xyz/faq` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteScript a11y={dict.common} />
      <Header dict={dict} current="faq" />

      <main id="main">
        <div className="head-spacer" id="head-spacer" />

        <section className="band page-head">
          <div className="shell">
            <p className="eyebrow">{faq.pageHead.eyebrow}</p>
            <h1>{faq.pageHead.h1}</h1>
            <p className="lede">{faq.pageHead.lede}</p>
          </div>
        </section>

        <section className="band band--invert">
          <div className="shell">
            <div className="faq">
              {faq.qa.map((item, i) => (
                <details className="q appear" style={i ? { "--d": `${50 * i}ms` } : undefined} key={item.q}>
                  <summary>{item.q}</summary>
                  <div className="a">
                    {item.a.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
            <p className="note appear" style={{ marginTop: 40 }}>
              {faq.note}
            </p>
          </div>
        </section>

        {/* pager */}
        <section className="band band--tight">
          <div className="shell">
            <div className="pager">
              <Link href="/mechanic">
                <span className="k">{faq.pager.back.label}</span><span className="t">{faq.pager.back.title}</span>
                <span className="d">{faq.pager.back.desc}</span>
              </Link>
              <Link href="/roadmap">
                <span className="k">{faq.pager.also.label}</span><span className="t">{faq.pager.also.title}</span>
                <span className="d">{faq.pager.also.desc}</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}
