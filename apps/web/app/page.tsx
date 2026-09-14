import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SiteScript } from "@/components/SiteScript";
import { HeroCanvas } from "@/components/HeroCanvas";
import { PlatformMarks } from "@/components/PlatformMarks";
import { ProblemCarousel } from "@/components/ProblemCarousel";
import { content } from "@/content/site";

const GITHUB = "https://github.com/PixStock/pixstock";
// The vault lives on its own origin, and has to: it shares no storage, no
// service worker and no cookie with the online app, which is the boundary the
// whole design rests on.
//
// Read from the environment so moving it is a variable, not a commit. Next
// inlines NEXT_PUBLIC_* at build time, so changing it needs a rebuild — a
// restart leaves the old address in the shipped bundle.
//
// `||`, not `??`: a Dockerfile that declares `ARG NEXT_PUBLIC_VAULT_URL`
// without a value still sets the variable, to the empty string. `??` would
// accept that and ship `href=""`, which is a button that reloads the page.
//
// The scheme is added when it is missing, because a bare domain is the shape
// a hosting platform hands you — RAILWAY_PUBLIC_DOMAIN and its equivalents
// carry no protocol — and an href without one is not an address at all but a
// relative path. Set to `vault.example.com`, the button went to
// `https://this-app/vault.example.com`, which is a 404 that looks like a
// typo in someone else's code.
const configuredVault = process.env.NEXT_PUBLIC_VAULT_URL || "pixstock-production.up.railway.app";
const VAULT = /^https?:\/\//i.test(configuredVault)
  ? configuredVault
  : `https://${configuredVault}`;

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
              <a className="btn btn--solid" href="#flow">{home.hero.ctaSeeMechanic}</a>
              <a className="btn" href="#try">{home.hero.ctaRequestAccess}</a>
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

        {/* the three proofs, in the order the phone runs them */}
        <section className="band" id="proofs">
          <div className="shell">
            <p className="eyebrow">{home.proofs.eyebrow}</p>
            <h2 className="title appear">{home.proofs.title}</h2>
            <p className="lede appear" style={{ "--d": "80ms" }}>
              {home.proofs.lede}
            </p>

            <div className="lots">
              {home.proofs.cards.map((card, i) => (
                <article className="lot appear" style={i ? { "--d": `${i * 90}ms` } : undefined} key={card.title}>
                  <div className="lot-top">
                    <span className="ph">{card.ph}</span>
                    <span className="wk num">{card.wk}</span>
                  </div>
                  <h3>{card.title}</h3>
                  <p className="goal">{card.goal}</p>
                  <ul>
                    {card.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <p className="block">
                    <b>{card.blockLabel}</b> {card.block}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* the basket and the paper backup */}
        <section className="band band--invert" id="pieces">
          <div className="shell">
            <p className="eyebrow">{home.pieces.eyebrow}</p>
            <h2 className="title appear">{home.pieces.title}</h2>
            <p className="lede appear" style={{ "--d": "80ms" }}>
              {home.pieces.lede}
            </p>

            <div className="tickets">
              {[home.pieces.basket, home.pieces.paper].map((piece, i) => (
                <article
                  className={`ticket appear${i ? " ticket--challenge" : ""}`}
                  style={i ? { "--d": "100ms" } : undefined}
                  key={piece.title}
                >
                  <div className="ticket-head">
                    <div>
                      <div className="ticket-side">{piece.side}</div>
                      <h3>{piece.title}</h3>
                    </div>
                  </div>
                  <p className="claim">{piece.claim}</p>
                  <dl>
                    {piece.kv.map((row) => (
                      <div className="kv" key={row.k}><dt>{row.k}</dt><dd>{row.v}</dd></div>
                    ))}
                  </dl>
                  <p className="note" style={{ marginTop: 0 }}>{piece.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* the loop, end to end */}
        <section className="band" id="flow">
          <div className="shell">
            <p className="eyebrow">{home.flow.eyebrow}</p>
            <h2 className="title appear">{home.flow.title}</h2>
            <p className="lede appear" style={{ "--d": "80ms" }}>
              {home.flow.lede}
            </p>

            <div className="tl appear" id="tl">
              <div className="tl-rail"><div className="tl-fill" id="tl-fill" /></div>
              <div className="tl-steps">
                {home.flow.steps.map((step, i) => (
                  <div className="tl-step" data-step={i} key={step.t}>
                    <span className="t">{step.t}</span><span className="n">{step.n}</span><span className="d">{step.d}</span>
                  </div>
                ))}
              </div>
              {/* the phases have to line up with the step columns above:
                  steps 1-2 are online, step 3 is the air gap, step 4 the relayer */}
              <div className="tl-phase" aria-hidden="true">
                {home.flow.phases.map((phase, i) => (
                  <div key={phase} style={{ flex: i === 0 ? 2 : 1 }}>{phase}</div>
                ))}
              </div>
            </div>
            <Link className="more appear" href="/protocol">
              {home.flow.more}<i>&rarr;</i>
            </Link>
          </div>
        </section>

        {/* four objections, answered on the page */}
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
            <a className="more appear" href={`${GITHUB}/blob/main/docs/THREAT-MODEL.md`}>
              {home.objections.more}<i>&rarr;</i>
            </a>
          </div>
        </section>

        {/* cta */}
        <section className="band band--invert cta" id="try">
          <div className="shell">
            <h2 className="appear">
              {home.cta.titlePrefix}<span className="accent">{home.cta.titleAccent}</span>{home.cta.titleSuffix}
            </h2>
            <p className="lede appear" style={{ "--d": "80ms", marginInline: "auto", textAlign: "center", maxWidth: "48ch" }}>
              {home.cta.lede}
            </p>
            <div className="hero-cta appear" style={{ "--d": "160ms" }}>
              <a className="btn btn--solid" href={VAULT}>{home.cta.requestAccess}</a>
              <a className="btn" href={GITHUB}>{home.cta.readMechanic}</a>
            </div>
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}
