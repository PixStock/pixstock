import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SiteScript } from "@/components/SiteScript";
import { HeroCanvas } from "@/components/HeroCanvas";
import { PlatformMarks } from "@/components/PlatformMarks";
import { ProblemCarousel } from "@/components/ProblemCarousel";
import { content } from "@/content/site";

export function generateMetadata(): Metadata {
  const dict = content;

  return {
    title: dict.home.meta.title,
    description: dict.home.meta.description,
    alternates: { canonical: "/" },
    openGraph: {
      title: dict.home.meta.title,
      description: dict.home.meta.description,
      url: "/",
    },
    twitter: {
      title: dict.home.meta.title,
      description: dict.home.meta.description,
    },
  };
}

export default function Home() {
  const dict = content;
  const home = dict.home;

  return (
    <>
      <SiteScript a11y={dict.common} />
      <Header dict={dict} dark />

      <main id="main">
        <div id="top" />
        {/* hero · the emblem is assembled by the particle field on the canvas */}
        <section className="hero band" style={{ paddingBlock: 0 }}>
          <HeroCanvas />
          <div className="hero-glow" aria-hidden="true" />
          <div className="head-spacer" id="head-spacer" />

          <div className="hero-body shell">
            <h1 className="appear">
              {home.hero.titlePrefix}
              <span className="accent">{home.hero.titleAccent}</span>
              {home.hero.titleSuffix}
            </h1>
            <p className="lede appear" style={{ "--d": "120ms" }}>
              {home.hero.lede}
            </p>
            <div className="hero-cta appear" style={{ "--d": "240ms" }}>
              <a className="btn btn--solid" href="#mechanic">{home.hero.ctaSeeMechanic}</a>
              <a className="btn" href="#access">{home.hero.ctaRequestAccess}</a>
            </div>
          </div>

          <div className="hero-stats">
            {home.hero.stats.map((stat, i) => (
              <div className="hero-stat appear" style={{ "--d": `${340 + i * 60}ms` }} key={stat.label}>
                <span className="v num">{stat.value}</span>
                <span className="k">{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        <PlatformMarks />

        {/* statement · lit one word at a time as the section scrolls past */}
        <section className="band statement" id="statement">
          <div className="shell">
            <p id="statement-copy">{home.statement}</p>
          </div>
        </section>

        <ProblemCarousel dict={home.problem} previous={dict.common.previous} next={dict.common.next} />

        {/* the two sides of the market */}
        <section className="band" id="mechanic">
          <div className="shell">
            <p className="eyebrow">{home.mechanicSection.eyebrow}</p>
            <h2 className="title appear">{home.mechanicSection.title}</h2>
            <p className="lede appear" style={{ "--d": "80ms" }}>
              {home.mechanicSection.lede}
            </p>

            <div className="tickets">
              <article className="ticket ticket--boost appear">
                <div className="ticket-head">
                  <div>
                    <div className="ticket-side">{home.mechanicSection.boost.side}</div>
                    <h3>{home.mechanicSection.boost.title}</h3>
                  </div>
                </div>
                <p className="claim">{home.mechanicSection.boost.claim}</p>
                <dl>
                  {home.mechanicSection.boost.kv.map((row) => (
                    <div className="kv" key={row.k}><dt>{row.k}</dt><dd>{row.v}</dd></div>
                  ))}
                </dl>
                <div className="outcome">
                  <div><span className="g">RIGHT</span><span>{home.mechanicSection.boost.outcomeRight}</span></div>
                  <div><span className="g">WRONG</span><span>{home.mechanicSection.boost.outcomeWrong}</span></div>
                </div>
              </article>

              <article className="ticket ticket--challenge appear" style={{ "--d": "100ms" }}>
                <div className="ticket-head">
                  <div>
                    <div className="ticket-side">{home.mechanicSection.challenge.side}</div>
                    <h3>{home.mechanicSection.challenge.title}</h3>
                  </div>
                </div>
                <p className="claim">{home.mechanicSection.challenge.claim}</p>
                <dl>
                  {home.mechanicSection.challenge.kv.map((row) => (
                    <div className="kv" key={row.k}><dt>{row.k}</dt><dd>{row.v}</dd></div>
                  ))}
                </dl>
                <div className="outcome">
                  <div><span className="g">RIGHT</span><span>{home.mechanicSection.challenge.outcomeRight}</span></div>
                  <div><span className="g">WRONG</span><span>{home.mechanicSection.challenge.outcomeWrong}</span></div>
                </div>
              </article>
            </div>

            <p className="note appear" style={{ marginTop: 34 }}>
              {home.mechanicSection.note}
            </p>
            <Link className="more appear" href="/mechanic">
              {home.mechanicSection.more}<i>&rarr;</i>
            </Link>
          </div>
        </section>

        {/* the round */}
        <section className="band band--invert" id="round">
          <div className="shell">
            <p className="eyebrow">{home.round.eyebrow}</p>
            <h2 className="title appear">{home.round.title}</h2>
            <p className="lede appear" style={{ "--d": "80ms" }}>
              {home.round.lede}
            </p>

            <div className="tl appear" id="tl">
              <div className="tl-rail"><div className="tl-fill" id="tl-fill" /></div>
              <div className="tl-steps">
                {home.round.steps.map((step, i) => (
                  <div className="tl-step" data-step={i} key={step.t}>
                    <span className="t">{step.t}</span><span className="n">{step.n}</span><span className="d">{step.d}</span>
                  </div>
                ))}
              </div>
              <div className="tl-phase" aria-hidden="true">
                {home.round.phases.map((phase) => (
                  <div key={phase}>{phase}</div>
                ))}
              </div>
            </div>
            <Link className="more appear" href="/mechanic#resolution">
              {home.round.more}<i>&rarr;</i>
            </Link>
          </div>
        </section>

        {/* three objections, condensed */}
        <section className="band" id="objections">
          <div className="shell">
            <p className="eyebrow">{home.objections.eyebrow}</p>
            <h2 className="title appear">{home.objections.title}</h2>
            <div className="faq">
              {home.objections.items.map((item, i) => (
                <details className="q appear" style={i ? { "--d": `${i * 50}ms` } : undefined} key={item.q}>
                  <summary>{item.q}</summary>
                  <div className="a"><p>{item.a}</p></div>
                </details>
              ))}
            </div>
            <Link className="more appear" href="/faq">
              {home.objections.more}<i>&rarr;</i>
            </Link>
          </div>
        </section>

        {/* cta */}
        <section className="band band--invert cta" id="access">
          <div className="shell">
            <h2 className="appear">
              {home.cta.titlePrefix}<span className="accent">{home.cta.titleAccent}</span>{home.cta.titleSuffix}
            </h2>
            <p className="lede appear" style={{ "--d": "80ms", marginInline: "auto", textAlign: "center", maxWidth: "48ch" }}>
              {home.cta.lede}
            </p>
            <div className="hero-cta appear" style={{ "--d": "160ms" }}>
              <a className="btn btn--solid" href="mailto:hello@pixstock.xyz?subject=PixStock%20early%20access">
                {home.cta.requestAccess}
              </a>
              <a className="btn" href="#mechanic">{home.cta.readMechanic}</a>
            </div>
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}
