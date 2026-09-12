import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SiteScript } from "@/components/SiteScript";
import { hasLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { localeHref } from "@/i18n/paths";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/roadmap">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const m = dict.roadmap.meta;

  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: localeHref(locale, "/roadmap") },
    openGraph: {
      title: m.ogTitle,
      description: m.description,
      url: localeHref(locale, "/roadmap"),
    },
  };
}

export default async function RoadmapPage({ params }: PageProps<"/[locale]/roadmap">) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const roadmap = dict.roadmap;
  const href = (path: string) => localeHref(locale, path);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: dict.site.siteName, item: `https://pixstock.xyz${href("/")}` },
      { "@type": "ListItem", position: 2, name: roadmap.breadcrumbName, item: `https://pixstock.xyz${href("/roadmap")}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteScript a11y={dict.common} />
      <Header locale={locale} dict={dict} current="roadmap" />

      <main id="main">
        <div className="head-spacer" id="head-spacer" />

        <section className="band page-head">
          <div className="shell">
            <p className="eyebrow">{roadmap.pageHead.eyebrow}</p>
            <h1>{roadmap.pageHead.h1}</h1>
            <p className="lede">{roadmap.pageHead.lede}</p>
          </div>
        </section>

        {/* roadmap */}
        <section className="band" id="roadmap">
          <div className="shell">
            <h2 className="title appear">{roadmap.lotsTitle}</h2>

            <div className="lots">
              {roadmap.lots.map((lot, i) => (
                <article className="lot appear" style={i ? { "--d": `${90 * i}ms` } : undefined} key={lot.badge}>
                  <div className="lot-top"><span className="ph">{lot.badge}</span><span className="wk">{lot.wk}</span></div>
                  <h3>{lot.h3}</h3>
                  <p className="goal">{lot.goal}</p>
                  <ul>
                    {lot.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <p className="block"><b>{lot.blockLabel}</b> {lot.block}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* targets */}
        <section className="band band--invert">
          <div className="shell">
            <p className="eyebrow">{roadmap.targets.eyebrow}</p>
            <div className="split">
              <h2 className="title appear">{roadmap.targets.title}</h2>
              <div className="copy appear" style={{ "--d": "80ms" }}>
                {roadmap.targets.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>

            <div className="tw appear">
              <table>
                <caption>{roadmap.targets.tableCaption}</caption>
                <thead>
                  <tr>
                    <th>{roadmap.targets.headers[0]}</th>
                    <th className="n">{roadmap.targets.headers[1]}</th>
                    <th className="n">{roadmap.targets.headers[2]}</th>
                    <th className="n">{roadmap.targets.headers[3]}</th>
                  </tr>
                </thead>
                <tbody>
                  {roadmap.targets.rows.map((row) => (
                    <tr key={row.indicator}>
                      <td data-label={roadmap.targets.headers[0]}>{row.indicator}</td>
                      <td className="n" data-label={roadmap.targets.headers[1]}>{row.lot1}</td>
                      <td className="n" data-label={roadmap.targets.headers[2]}>{row.lot2}</td>
                      <td className="n" data-label={roadmap.targets.headers[3]}>{row.lot3}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note appear" style={{ marginTop: 26 }}>
              {roadmap.targets.note}
            </p>
          </div>
        </section>

        {/* compliance */}
        <section className="band" id="compliance">
          <div className="shell split">
            <div>
              <p className="eyebrow">{roadmap.compliance.eyebrow}</p>
              <h2 className="title appear">{roadmap.compliance.title}</h2>
              <div className="copy appear" style={{ "--d": "80ms", marginTop: 22 }}>
                {roadmap.compliance.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>
            <div>
              <div className="rows">
                {roadmap.compliance.rows.map((row, i) => (
                  <div className="row appear" style={i ? { "--d": `${60 * i}ms` } : undefined} key={row.t}>
                    <span className="t">{row.t}</span><span className="d">{row.d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* pager */}
        <section className="band band--tight">
          <div className="shell">
            <div className="pager">
              <Link href={href("/mechanic")}>
                <span className="k">{roadmap.pager.back.label}</span><span className="t">{roadmap.pager.back.title}</span>
                <span className="d">{roadmap.pager.back.desc}</span>
              </Link>
              <Link href={href("/faq")}>
                <span className="k">{roadmap.pager.also.label}</span><span className="t">{roadmap.pager.also.title}</span>
                <span className="d">{roadmap.pager.also.desc}</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer locale={locale} dict={dict} />
    </>
  );
}
