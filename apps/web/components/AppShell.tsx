"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { api, type DisplayPrice, type Health } from "@/lib/api";
import { usePairedVault } from "@/lib/vault";

export type AppRoute = "trade" | "basket" | "vault" | "sign";

/** Where the order is, across both screens. Step four is the broadcast. */
export type RailStep = 1 | 2 | 3 | 4;

const TABS: Array<{ key: AppRoute | "protocol"; href: string; label: string }> = [
  { key: "trade", href: "/trade", label: "Trade" },
  { key: "basket", href: "/basket", label: "Baskets" },
  { key: "vault", href: "/vault", label: "Vault" },
  { key: "protocol", href: "/protocol", label: "How it works" },
];

const RAIL = ["Build it here", "Show the phone", "Phone signs", "We broadcast"] as const;

/** How often the strip re-reads the price — the same 10s /trade already used. */
const PRICE_POLL_MS = 10_000;

export interface AppShellProps {
  current: AppRoute;
  eyebrow: string;
  title: string;
  lede: string;
  step: RailStep;
  /** On /sign the strip carries the nonce fact and this id instead. */
  session?: string;
  /**
   * Four labels for the rail, where the default ones would be wrong.
   *
   * /sign arrives with the order already built, so its first two steps are
   * states — "Built", "Showing" — not things to go and do.
   */
  railLabels?: readonly string[];
  children: React.ReactNode;
}

/**
 * The chrome the four app routes share: who you are paired with, what is up,
 * where the order has got to.
 *
 * A separate component rather than a variant of the marketing page's band,
 * because the two have opposite jobs. That one introduces the product to
 * someone who has never seen it; this one gets out of the way of a control.
 */
export function AppShell({
  current,
  eyebrow,
  title,
  lede,
  step,
  session,
  railLabels,
  children,
}: AppShellProps) {
  const rail = railLabels ?? RAIL;
  return (
    <>
      <header className="app-head">
        <Link className="brand" href="/" aria-label="PixStock, home">
          <Logo />
          <span className="brand-name">PixStock</span>
        </Link>

        <nav className="app-tabs" aria-label="App">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              className="app-tab"
              href={tab.href}
              aria-current={tab.key === current ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <VaultChip />

        {/* Wired by SiteScript, which finds it by id — the same toggle the
            marketing pages use, so a theme chosen there survives the trip. */}
        <button className="theme" id="theme" type="button" aria-label="Switch to the light theme">
          <svg className="moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
            <path d="M13.4 9.6A5.6 5.6 0 0 1 6.4 2.6a5.6 5.6 0 1 0 7 7Z" />
          </svg>
          <svg className="sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="8" r="3.1" />
            <path d="M8 1v1.7M8 13.3V15M1 8h1.7M13.3 8H15M3.2 3.2l1.2 1.2M11.6 11.6l1.2 1.2M12.8 3.2l-1.2 1.2M4.4 11.6l-1.2 1.2" />
          </svg>
        </button>
      </header>

      <StatusStrip {...(session !== undefined ? { session } : {})} />

      <section className="app-page-head">
        <div className="t">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="lede">{lede}</p>
        </div>

        <div className="app-rail" role="list" aria-label="Progress">
          {rail.map((label, i) => (
            <div
              key={label}
              role="listitem"
              className={`app-rail-step app-rail-step--${
                i + 1 < step ? "done" : i + 1 === step ? "current" : "future"
              }`}
            >
              <span className="app-rail-bar" aria-hidden="true" />
              <span className="app-rail-label">
                {i + 1} {railLabels ? label : i + 1 < step ? DONE_LABELS[i] : label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <main id="main" className="app-body">
        {children}
      </main>
    </>
  );
}

/** A step behind you is a thing that happened, not a thing to do. */
const DONE_LABELS = ["Built", "Shown", "Signed", "Broadcast"] as const;

/**
 * Which vault this browser sends orders to.
 *
 * Read once, in the header, and nowhere else. Three pages each asking for the
 * same public key is three chances to paste the wrong one.
 */
function VaultChip() {
  const { vault, isValid } = usePairedVault();

  if (!isValid) {
    return (
      <Link className="vault-chip vault-chip--off" href="/vault">
        <span className="dot" aria-hidden="true" />
        No vault paired
      </Link>
    );
  }

  return (
    <Link className="vault-chip vault-chip--on" href="/vault">
      <span className="dot" aria-hidden="true" />
      Vault paired
      <span className="addr">
        {vault.slice(0, 4)}…{vault.slice(-4)}
      </span>
    </Link>
  );
}

/**
 * What the relayer can do right now, stated whether or not it is bad news.
 *
 * The component this replaces rendered nothing at all while everything
 * worked, which meant the one question a judge asks first — "is that live?" —
 * had no answer on screen.
 */
function StatusStrip({ session }: { session?: string }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);
  const [prices, setPrices] = useState<DisplayPrice[] | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);

  useEffect(() => {
    api
      .health()
      .then((next) => {
        setHealth(next);
        setDown(false);
      })
      .catch(() => setDown(true));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const read = () =>
      api
        .prices()
        .then((result) => {
          if (cancelled) return;
          setPrices(result.prices);
          setReadAt(Date.now());
        })
        .catch(() => {
          // The relayer item beside this one already says the same thing.
        });

    void read();
    const timer = setInterval(read, PRICE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // On /sign the order is already built and the only fact worth the width is
  // that it is not about to expire under the holder while they read it.
  if (session !== undefined) {
    return (
      <div className="strip" role="status">
        <span className="strip-item strip-item--ok">
          <span className="dot" aria-hidden="true" />
          Order held open by a durable nonce — it will not expire while you check it
        </span>
        <span className="strip-end">
          Session <span className="num">{session}</span>
        </span>
      </div>
    );
  }

  // Which feeds our Pyth grant does not cover today. Read from the relayer's
  // own answer rather than a list in this file, which would be a list that
  // goes stale the first time the grant changes.
  const uncovered = (prices ?? []).filter((p) => p.unavailable).map((p) => p.symbol);

  return (
    <div className="strip" role="status">
      <span className={`strip-item strip-item--${down ? "crit" : health ? "ok" : ""}`}>
        <span className="dot" aria-hidden="true" />
        {down ? "Relayer not answering" : health ? "Relayer live" : "Asking the relayer…"}
      </span>

      <span className={`strip-item strip-item--${prices ? "ok" : down ? "warn" : ""}`}>
        <span className="dot" aria-hidden="true" />
        {prices ? "Pyth prices live" : "Prices stale"}
        {readAt !== null && <Age since={readAt} />}
      </span>

      {uncovered.length > 0 && (
        <span className="strip-item strip-item--warn">
          <span className="dot" aria-hidden="true" />
          {list(uncovered)} {uncovered.length === 1 ? "has" : "have"} no signed price today
        </span>
      )}

      {health?.missing.map((item) => (
        <span key={item} className="strip-item strip-item--warn">
          <span className="dot" aria-hidden="true" />
          {item}
        </span>
      ))}

      <span className="strip-end">
        Network fees paid by PixStock · your vault can hold{" "}
        <span className="num">0.00</span> SOL
      </span>
    </div>
  );
}

/** Seconds since the last read, counted on screen so "live" can be checked. */
function Age({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  return <span className="age">{Math.max(0, Math.round((now - since) / 1000))}s ago</span>;
}

/** "Apple, Nvidia and SPY", as anyone would say it out loud. */
function list(items: string[]): string {
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
