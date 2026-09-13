import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SiteScript } from "@/components/SiteScript";
import { content } from "@/content/site";
import {
  CHUNK_SIZES,
  DEFAULT_FPS,
  HEADER_CHARS,
  MAX_FRAMES,
  PROTOCOL_MAGIC,
  SID_CHARS,
} from "@pixstock/agqp";
import {
  EVALUATED_RULES,
  MAX_SLIPPAGE_BPS,
  POLICY_RULES,
  UNEVALUATED_RULES,
} from "@pixstock/tx-policy";

export function generateMetadata(): Metadata {
  const m = content.protocol.meta;
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: "/protocol" },
    openGraph: { title: m.ogTitle, description: m.description, url: "/protocol" },
  };
}

/**
 * The protocol page reads its numbers from the packages themselves — frame
 * sizes from @pixstock/agqp, the rule list and which rules are actually
 * enforced from @pixstock/tx-policy.
 *
 * A spec page that restates constants by hand drifts from the code within a
 * week, and the drift is invisible. Here it cannot: change the cap, and this
 * page changes.
 */
export default function ProtocolPage() {
  const dict = content;
  const p = dict.protocol;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: dict.site.siteName, item: "https://pixstock.xyz/" },
      { "@type": "ListItem", position: 2, name: p.breadcrumbName, item: "https://pixstock.xyz/protocol" },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteScript a11y={dict.common} />
      <Header dict={dict} current="protocol" />

      <main id="main">
        <div className="head-spacer" id="head-spacer" />

        <section className="band page-head">
          <div className="shell">
            <p className="eyebrow">{p.pageHead.eyebrow}</p>
            <h1>{p.pageHead.title}</h1>
            <p className="lede">{p.pageHead.lede}</p>
          </div>
        </section>

        {/* ── the optical channel ─────────────────────────────────────── */}
        <section className="band band--tight" id="channel">
          <div className="shell">
            <h2>{p.channel.title}</h2>
            {p.channel.body.map((line, i) => (
              <p key={i} className="copy">{line}</p>
            ))}

            <pre className="frame-envelope">
              {PROTOCOL_MAGIC}:&lt;SID&gt;:&lt;INDEX&gt;:&lt;TOTAL&gt;:&lt;CRC32&gt;:&lt;CHUNK&gt;
            </pre>

            <table className="spec-table">
              <thead>
                <tr>
                  <th scope="col">{p.channel.headers.field}</th>
                  <th scope="col">{p.channel.headers.width}</th>
                  <th scope="col">{p.channel.headers.role}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>{PROTOCOL_MAGIC}</code></td>
                  <td className="num">3</td>
                  <td>{p.channel.fields.magic}</td>
                </tr>
                <tr>
                  <td><code>SID</code></td>
                  <td className="num">{SID_CHARS}</td>
                  <td>{p.channel.fields.sid}</td>
                </tr>
                <tr>
                  <td><code>INDEX</code> / <code>TOTAL</code></td>
                  <td className="num">2 + 2</td>
                  <td>{p.channel.fields.counters.replace("{max}", String(MAX_FRAMES))}</td>
                </tr>
                <tr>
                  <td><code>CRC32</code></td>
                  <td className="num">8</td>
                  <td>{p.channel.fields.crc}</td>
                </tr>
                <tr>
                  <td><code>CHUNK</code></td>
                  <td className="num">≤ {(CHUNK_SIZES.L / 2) * 3}</td>
                  <td>{p.channel.fields.chunk}</td>
                </tr>
              </tbody>
            </table>

            <p className="copy">
              {p.channel.sizes
                .replace("{header}", String(HEADER_CHARS))
                .replace("{s}", String(CHUNK_SIZES.S))
                .replace("{m}", String(CHUNK_SIZES.M))
                .replace("{l}", String(CHUNK_SIZES.L))
                .replace("{fps}", String(DEFAULT_FPS))}
            </p>
          </div>
        </section>

        {/* ── the signing policy ──────────────────────────────────────── */}
        <section className="band band--tight" id="policy">
          <div className="shell">
            <h2>{p.policy.title}</h2>
            {p.policy.body.map((line, i) => (
              <p key={i} className="copy">{line}</p>
            ))}

            <table className="spec-table">
              <thead>
                <tr>
                  <th scope="col">{p.policy.headers.rule}</th>
                  <th scope="col">{p.policy.headers.statement}</th>
                  <th scope="col">{p.policy.headers.state}</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(POLICY_RULES) as Array<keyof typeof POLICY_RULES>).map((rule) => {
                  const enforced = EVALUATED_RULES.includes(rule);
                  return (
                    <tr key={rule}>
                      <td><code>{rule}</code></td>
                      <td>{POLICY_RULES[rule]}</td>
                      <td className={enforced ? "" : "sev--2"}>
                        {enforced ? p.policy.enforced : p.policy.notEnforced}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="copy">
              {UNEVALUATED_RULES.length === 0
                ? p.policy.allEnforced
                : p.policy.honesty.replace("{unevaluated}", UNEVALUATED_RULES.join(", "))}
            </p>
            <p className="copy">{p.policy.cap.replace("{cap}", String(MAX_SLIPPAGE_BPS))}</p>
          </div>
        </section>

        {/* ── the offline price guard ─────────────────────────────────── */}
        <section className="band band--tight" id="pyth">
          <div className="shell">
            <h2>{p.pyth.title}</h2>
            <p className="status-note" role="note">
              {p.pyth.status}
            </p>
            {p.pyth.body.map((line, i) => (
              <p key={i} className="copy">{line}</p>
            ))}
          </div>
        </section>

        {/* ── paper vault ─────────────────────────────────────────────── */}
        <section className="band band--tight" id="paper-vault">
          <div className="shell">
            <h2>{p.paperVault.title}</h2>
            {p.paperVault.body.map((line, i) => (
              <p key={i} className="copy">{line}</p>
            ))}
          </div>
        </section>

        <section className="band band--tight">
          <div className="shell">
            <p className="copy">
              {p.source.text}{" "}
              <a href={p.source.href}>{p.source.label}</a>.
            </p>
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}
