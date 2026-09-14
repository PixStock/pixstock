import Link from "next/link";
import { Logo } from "./Logo";
import type { Content } from "@/content/site";

export function Footer({ dict }: { dict: Content }) {
  const footer = dict.common.footer;
  const columns = [footer.columns.product, footer.columns.protocol, footer.columns.company];

  return (
    <footer className="foot" id="foot">
      <div className="shell">
        <div className="foot-cols">
          <div>
            <Link className="brand" href="/" style={{ marginBottom: 16 }}>
              <Logo />
              <span className="brand-name">PixStock</span>
            </Link>
            <p className="about">{footer.about}</p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h3>{col.title}</h3>
              <ul>
                {col.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a href={link.href}>{link.label}</a>
                    ) : (
                      <Link href={link.href}>{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="wordmark" id="wordmark">
          <svg viewBox="0 0 1000 140" aria-hidden="true">
            <text
              className="rise"
              x="0"
              y="102"
              textLength="1000"
              lengthAdjust="spacingAndGlyphs"
              fontFamily="-apple-system, BlinkMacSystemFont, SF Pro Display, Segoe UI, Roboto, sans-serif"
              fontSize="124"
              fontWeight="700"
              letterSpacing="-4"
              fill="currentColor"
            >
              PixStock
            </text>
          </svg>
        </div>

        <div className="legal">
          <ul className="legal-list">
            {footer.legal.map((item, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ul>
          <p className="meta">
            <span>{footer.copyrightLabel}</span>
            <span>{footer.copyrightYear}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
