import Link from "next/link";
import { Logo } from "./Logo";
import type { Content } from "@/content/site";

export function Header({
  dict,
  current,
  dark,
}: {
  dict: Content;
  current?: "protocol" | "trade" | "basket" | "vault";
  dark?: boolean;
}) {
  const nav = dict.common.nav;

  return (
    <header className={`head${dark ? " head--dark" : ""}`} id="head">
      <Link className="brand" href="/" aria-label={dict.common.brandHome}>
        <Logo />
        <span className="brand-name">PixStock</span>
      </Link>
      <nav className="nav" aria-label="Pages">
        <div className="nav-group">
          <button type="button" aria-current={current === "protocol" ? "page" : undefined}>
            {nav.protocol}
            <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M1 1.5 5 5l4-3.5" />
            </svg>
          </button>
          <div className="nav-menu">
            {nav.protocolMenu.map((l) => (
              <Link key={l.href} href={l.href}>
                <span className="t">{l.title}</span>
                <span className="d">{l.desc}</span>
              </Link>
            ))}
          </div>
        </div>
        {nav.links.map((link) => (
          <Link key={link.href} href={link.href} aria-current={current === link.key ? "page" : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>
      <button className="theme" id="theme" type="button" aria-label={dict.common.themeToLight}>
        <svg className="moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
          <path d="M13.4 9.6A5.6 5.6 0 0 1 6.4 2.6a5.6 5.6 0 1 0 7 7Z" />
        </svg>
        <svg className="sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="8" r="3.1" />
          <path d="M8 1v1.7M8 13.3V15M1 8h1.7M13.3 8H15M3.2 3.2l1.2 1.2M11.6 11.6l1.2 1.2M12.8 3.2l-1.2 1.2M4.4 11.6l-1.2 1.2" />
        </svg>
      </button>
      <a className="btn btn--ghost" href={current ? "/#try" : "#try"}>
        <span className="dot" aria-hidden="true" />
        {dict.common.headerCta}
      </a>
    </header>
  );
}
