import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SiteScript } from "@/components/SiteScript";
import { ReputationChart } from "@/components/ReputationChart";
import { hasLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { localeHref } from "@/i18n/paths";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/mechanic">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const m = dict.mechanic.meta;

  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: localeHref(locale, "/mechanic") },
    openGraph: {
      title: m.ogTitle,
      description: m.description,
      url: localeHref(locale, "/mechanic"),
    },
  };
}

export default async function MechanicPage({ params }: PageProps<"/[locale]/mechanic">) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const mechanic = dict.mechanic;
  const href = (path: string) => localeHref(locale, path);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: dict.site.siteName, item: `https://pixstock.xyz${href("/")}` },
      { "@type": "ListItem", position: 2, name: mechanic.breadcrumbName, item: `https://pixstock.xyz${href("/mechanic")}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteScript a11y={dict.common} />
      <Header locale={locale} dict={dict} current="mechanic" />

      <main id="main">
        <div className="head-spacer" id="head-spacer" />

        <section className="band page-head">
          <div className="shell">
            <p className="eyebrow">{mechanic.pageHead.eyebrow}</p>
            <h1>{mechanic.pageHead.h1}</h1>
            <p className="lede">{mechanic.pageHead.lede}</p>
          </div>
        </section>

        {/* ranking weight */}
        <section className="band band--invert" id="weight">
          <div className="shell">
            <p className="eyebrow">{mechanic.weight.eyebrow}</p>
            <h2 className="title appear">{mechanic.weight.title}</h2>
            <p className="lede appear" style={{ "--d": "80ms" }}>
              {mechanic.weight.lede}
            </p>
            <div className="tw appear">
              <table>
                <caption>{mechanic.weight.tableCaption}</caption>
                <thead>
                  <tr>
                    <th>{mechanic.weight.headers[0]}</th>
                    <th>{mechanic.weight.headers[1]}</th>
                    <th className="n">{mechanic.weight.headers[2]}</th>
                  </tr>
                </thead>
                <tbody>
                  {mechanic.weight.rows.map((row) => (
                    <tr key={row.term}>
                      <td data-label={mechanic.weight.headers[0]}>{row.term}</td>
                      <td data-label={mechanic.weight.headers[1]}>{row.def}</td>
                      <td className="n" data-label={mechanic.weight.headers[2]}>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note appear" style={{ marginTop: 30 }}>
              {mechanic.weight.note}
            </p>
          </div>
        </section>

        {/* resolution */}
        <section className="band" id="resolution">
          <div className="shell">
            <p className="eyebrow">{mechanic.resolution.eyebrow}</p>
            <h2 className="title appear">{mechanic.resolution.title}</h2>
            <div className="copy appear" style={{ "--d": "80ms", marginTop: "clamp(26px, 3vw, 40px)" }}>
              {mechanic.resolution.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>

            <div className="tw appear">
              <table>
                <caption>{mechanic.resolution.tableCaption}</caption>
                <thead>
                  <tr>
                    <th className="rank">{mechanic.resolution.headers[0]}</th>
                    <th>{mechanic.resolution.headers[1]}</th>
                    <th>{mechanic.resolution.headers[2]}</th>
                  </tr>
                </thead>
                <tbody>
                  {mechanic.resolution.rows.map((row) => (
                    <tr key={row.rank}>
                      <td className="rank" data-label={mechanic.resolution.headers[0]}>{row.rank}</td>
                      <td data-label={mechanic.resolution.headers[1]}>{row.criterion}</td>
                      <td data-label={mechanic.resolution.headers[2]}>
                        <span className={`sev sev--${row.sev}`}><i /> {row.verdict}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="note appear" style={{ marginTop: 34 }}>
              {mechanic.resolution.note}
            </p>
          </div>
        </section>

        {/* slashing */}
        <section className="band band--invert" id="slashing">
          <div className="shell">
            <p className="eyebrow">{mechanic.slashing.eyebrow}</p>
            <h2 className="title appear">{mechanic.slashing.title}</h2>
            <p className="lede appear" style={{ "--d": "80ms" }}>
              {mechanic.slashing.lede}
            </p>
            <div className="tw appear">
              <table>
                <caption>{mechanic.slashing.tableCaption}</caption>
                <thead>
                  <tr>
                    <th>{mechanic.slashing.headers[0]}</th>
                    <th className="n">{mechanic.slashing.headers[1]}</th>
                    <th className="n">{mechanic.slashing.headers[2]}</th>
                  </tr>
                </thead>
                <tbody>
                  {mechanic.slashing.rows.map((row) => (
                    <tr key={row.situation}>
                      <td data-label={mechanic.slashing.headers[0]}>{row.situation}</td>
                      <td className="n" data-label={mechanic.slashing.headers[1]}>{row.slashed}</td>
                      <td className="n" data-label={mechanic.slashing.headers[2]}>{row.reputation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note appear" style={{ marginTop: 26 }}>
              {mechanic.slashing.note}
            </p>
          </div>
        </section>

        {/* where the slashed pot goes */}
        <section className="band" id="pot">
          <div className="shell split">
            <div>
              <p className="eyebrow">{mechanic.pot.eyebrow}</p>
              <h2 className="title appear">{mechanic.pot.title}</h2>
              <div className="copy appear" style={{ "--d": "80ms", marginTop: 22 }}>
                {mechanic.pot.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>
            <div>
              <div className="bars" id="bars">
                {mechanic.pot.bars.map((bar, i) => (
                  <div className="bar appear" style={i ? { "--d": `${i * 70}ms` } : undefined} key={bar.label}>
                    <span className="l">{bar.label}</span>
                    <span className="t"><span className={`f${i === mechanic.pot.bars.length - 1 ? " f--hatch" : ""}`} data-w={bar.value.replace(/\D/g, "")} style={i ? { "--d": `${120 * i}ms` } : undefined} /></span>
                    <span className="v">{bar.value}</span>
                    <span className="why">{bar.why}</span>
                  </div>
                ))}
              </div>
              <p className="note appear" style={{ marginTop: 30 }}>
                {mechanic.pot.note}
              </p>
            </div>
          </div>
        </section>

        {/* reputation */}
        <section className="band band--invert" id="reputation">
          <div className="shell">
            <p className="eyebrow">{mechanic.reputation.eyebrow}</p>
            <h2 className="title appear">{mechanic.reputation.title}</h2>
            <div className="split" style={{ marginTop: 44 }}>
              <div>
                <div className="copy appear">
                  {mechanic.reputation.paragraphs.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
                <div className="gates">
                  {mechanic.reputation.gates.map((gate, i) => (
                    <div className="gate appear" style={i ? { "--d": `${i * 60}ms` } : undefined} key={gate.mult}>
                      <span className="m">{gate.mult}</span><span className="c">{gate.caption}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="curve-wrap appear" style={{ "--d": "100ms" }}>
                <ReputationChart
                  gateLabels={mechanic.reputation.chartGates as [string, string, string]}
                  ariaLabel={mechanic.reputation.chartAriaLabel}
                />
                <div className="curve-legend">
                  {mechanic.reputation.curveLegend.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
              </div>
            </div>
            <p className="note appear" style={{ marginTop: 34 }}>
              {mechanic.reputation.note}
            </p>
          </div>
        </section>

        {/* pager */}
        <section className="band band--tight">
          <div className="shell">
            <div className="pager">
              <Link href={href("/roadmap")}>
                <span className="k">{mechanic.pager.next.label}</span><span className="t">{mechanic.pager.next.title}</span>
                <span className="d">{mechanic.pager.next.desc}</span>
              </Link>
              <Link href={href("/faq")}>
                <span className="k">{mechanic.pager.also.label}</span><span className="t">{mechanic.pager.also.title}</span>
                <span className="d">{mechanic.pager.also.desc}</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer locale={locale} dict={dict} />
    </>
  );
}
