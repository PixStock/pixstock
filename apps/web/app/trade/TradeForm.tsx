"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ASSETS, USDC_MINT, formatAmount, formatScaled } from "@pixstock/shared";
import { api, RelayerError, type DisplayPrice, type Quote, type VaultBalance } from "@/lib/api";
import { usePairedVault } from "@/lib/vault";
import { content } from "@/content/site";

/** USDC has six decimals; a u64 of them is what the vault will check. */
function toRawUsdc(amount: string): string | null {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return BigInt(Math.round(parsed * 1e6)).toString();
}

/** The amounts people actually type, plus the one they mean but never type. */
const QUICK = ["50", "100", "500"] as const;

/** "Tesla", "Tesla and Apple", "Tesla, Apple and Nvidia". */
function listed(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function TradeForm() {
  const t = content.trade;
  const router = useRouter();
  const { vault, isValid } = usePairedVault();

  const [symbol, setSymbol] = useState(ASSETS[0]!.symbol);
  const [amount, setAmount] = useState("50");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quotedAt, setQuotedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const asset = ASSETS.find((a) => a.symbol === symbol)!;
  const rawAmount = useMemo(() => toRawUsdc(amount), [amount]);
  const [prices, setPrices] = useState<DisplayPrice[]>([]);
  // Held with the address it was read for, so unpairing cannot leave a
  // stale balance on screen without clearing state inside an effect.
  const [usdc, setUsdc] = useState<{ vault: string; balance: VaultBalance | null } | null>(null);

  // Every asset's price, not just the selected one: the five cards each show
  // theirs, and whether our Pyth grant covers the feed at all. That second
  // fact is what decides whether the phone will call the price verified, and
  // a <select> hid it behind a click.
  useEffect(() => {
    let cancelled = false;

    const read = () =>
      api
        .prices()
        .then((result) => !cancelled && setPrices(result.prices))
        .catch(() => {
          // The status strip above already says the relayer is not answering.
        });

    void read();
    const timer = setInterval(read, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // What is actually spendable, so "All of it" means something.
  useEffect(() => {
    if (!isValid) return;
    let cancelled = false;
    api
      .vault(vault)
      .then((result) => {
        if (cancelled) return;
        setUsdc({ vault, balance: result.balances.find((b) => b.mint === USDC_MINT) ?? null });
      })
      .catch(() => {
        // A balance we cannot read is a line we do not draw.
      });
    return () => {
      cancelled = true;
    };
  }, [vault, isValid]);

  // Re-quote as the order changes. Debounced, because a keystroke is not an
  // intention to price.
  useEffect(() => {
    let cancelled = false;

    // Everything happens in the timer: setting state in the effect body itself
    // is what cascades renders.
    const timer = setTimeout(() => {
      if (!rawAmount) {
        setQuote(null);
        return;
      }
      setQuoting(true);
      api
        .quote({ in: USDC_MINT, out: asset.mint, amount: rawAmount })
        .then((next) => {
          if (!cancelled) {
            setQuote(next);
            setQuotedAt(Date.now());
            setError(null);
          }
        })
        .catch((err: RelayerError) => {
          if (!cancelled) {
            setQuote(null);
            setError(err.message);
          }
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [asset.mint, rawAmount]);

  async function send() {
    if (!rawAmount || !isValid) return;
    setSending(true);
    setError(null);
    try {
      const order = await api.createOrder({
        vault,
        legs: [{ inMint: USDC_MINT, outMint: asset.mint, inAmount: rawAmount }],
      });
      router.push(`/sign/${order.orderId}`);
    } catch (err) {
      setError((err as RelayerError).message);
      setSending(false);
    }
  }

  const priceOf = (s: string) => prices.find((p) => p.symbol === s) ?? null;
  const selected = priceOf(symbol);

  // Named from the relayer's own answer, for the same reason the per-card
  // badges are: a list of covered symbols typed into the copy is a list that
  // is wrong the first time the grant changes, and this one used to say
  // "Tesla" three lines under a comment explaining why it must not.
  // `unavailable` is the reason, not a flag: present means the grant does not
  // reach this feed, and its absence is what "signed price" on the card means.
  const covered = ASSETS.filter((a) => {
    const p = priceOf(a.symbol);
    return p !== null && !p.unavailable;
  }).map((a) => a.name);
  const grantLine =
    prices.length === 0
      ? null
      : covered.length === 0
        ? t.form.grantNone
        : covered.length === ASSETS.length
          ? t.form.grantAll
          : `Our Pyth grant covers ${listed(covered)}. ${t.form.grantTail}`;
  const balance =
    isValid && usdc?.vault === vault && usdc.balance ? usdc.balance.amount.toFixed(2) : null;

  return (
    <div className="app-cols">
      <div className="stack-24">
        <div style={{ display: "grid", gap: 12 }}>
          <span className="eyebrow">{t.form.assetLabel}</span>
          <div className="asset-cards">
            {ASSETS.map((a) => {
              const p = priceOf(a.symbol);
              return (
                <button
                  key={a.symbol}
                  type="button"
                  className="asset-card"
                  aria-pressed={a.symbol === symbol}
                  onClick={() => setSymbol(a.symbol)}
                >
                  <span className="sym">{a.symbol}</span>
                  <span className="name">{a.name}</span>
                  <span className="px">
                    {p && !p.unavailable
                      ? p.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : "—"}
                  </span>
                  {/*
                    Read from the relayer's own answer. A list of covered
                    symbols written here would be a list that goes stale the
                    first time the Pyth grant changes.
                  */}
                  <span className={`cover cover--${p?.unavailable ? "warn" : "ok"}`}>
                    {p?.unavailable ? "unsigned today" : "signed price"}
                  </span>
                </button>
              );
            })}
          </div>
          {grantLine && (
            <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
              {grantLine}
            </p>
          )}
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <span className="eyebrow">{t.form.amountLabel}</span>
          <div className="amount-row">
            <label className="amount-field">
              <span className="sr-only">{t.form.amountLabel}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="10"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="affix">{t.form.amountUnit}</span>
            </label>

            {QUICK.map((value) => (
              <button
                key={value}
                type="button"
                className="quick"
                aria-pressed={amount === value}
                onClick={() => setAmount(value)}
              >
                {value}
              </button>
            ))}
            <button
              type="button"
              className="quick"
              disabled={balance === null}
              aria-pressed={balance !== null && amount === balance}
              onClick={() => balance !== null && setAmount(balance)}
            >
              All of it
            </button>
          </div>
          {balance !== null && (
            <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
              You hold <span className="num">{balance}</span> USDC in{" "}
              <span className="num">
                {vault.slice(0, 4)}…{vault.slice(-4)}
              </span>
            </p>
          )}
        </div>

        <div className="after">
          <span className="eyebrow">What happens after you press send</span>
          <div className="after-cols">
            <div className="after-step">
              <span className="n">01</span>
              <span className="t">It becomes a QR on this screen</span>
              <span className="d">
                The relayer builds the transaction and holds it open with a durable nonce.
                Nothing is signed yet.
              </span>
            </div>
            <div className="after-step">
              <span className="n">02</span>
              <span className="t">Your phone reads it and checks it</span>
              <span className="d">
                In airplane mode, against Pyth&apos;s own signature. It prints a ticket and
                refuses anything that does not match.
              </span>
            </div>
            <div className="after-step">
              <span className="n">03</span>
              <span className="t">Sixty-four bytes come back</span>
              <span className="d">
                A signature, held up to your webcam. We pay the fee and broadcast it. Your
                key never left the phone.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="app-col--preview">
        <div className={`panel${quoting ? " repricing" : ""}`}>
          <div className="panel-head">
            <span className="eyebrow">You receive</span>
            {quoting ? (
              <span className="fresh fresh--stale">re-pricing…</span>
            ) : (
              quotedAt !== null && <Freshness since={quotedAt} />
            )}
          </div>

          <div className="panel-figure">
            <span className="v">
              {quote ? formatScaled(quote.out.amount, asset.decimals, 1, 6) : "—"}
            </span>
            <span className="sym">
              {asset.symbol} · {asset.name}
            </span>
            <span className="per">
              {selected && !selected.unavailable
                ? `at ${selected.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} each`
                : "no signed price for this asset today"}
            </span>
          </div>

          <dl className="dl-rows">
            <div>
              <dt>{t.form.worstCase}</dt>
              <dd className="num">
                {quote
                  ? `${formatAmount(quote.minOutAmount, asset.decimals, 6)} ${asset.symbol}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{t.form.routedThrough}</dt>
              <dd>{quote ? quote.route.join(", then ") : "—"}</dd>
            </div>
            <div>
              <dt>{t.form.priceImpact}</dt>
              <dd className="num">
                {quote ? `${(Number(quote.priceImpactPct) * 100).toFixed(3)}%` : "—"}
              </dd>
            </div>
            <div>
              <dt>{t.form.networkFee}</dt>
              <dd className="ok">{t.form.feePaid}</dd>
            </div>
            <div>
              <dt>{t.form.pythReference}</dt>
              <dd className="num">
                {!selected ? (
                  "—"
                ) : selected.unavailable ? (
                  <span className="muted">{selected.unavailable}</span>
                ) : (
                  <>
                    {selected.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                    <span className="muted">
                      {selected.session === "ext" ? "extended hours" : "live"}
                    </span>
                  </>
                )}
              </dd>
            </div>
          </dl>

          {error && (
            <p className="alert-inline" role="alert">
              {error}
            </p>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            <button
              type="button"
              className="btn btn--solid app-cta"
              disabled={!quote || !isValid || sending}
              onClick={() => void send()}
            >
              {sending ? "Building the order…" : t.form.submit}
            </button>
            {/* Why a send is blocked now reads in the status strip and on the
                header chip, where the thing that is missing actually is. */}
            <p className="app-cta-note">Your phone decides. This browser cannot sign anything.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** How old the quote on screen is, counted so it can be checked. */
function Freshness({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.round((now - since) / 1000));
  return (
    <span className={`fresh${seconds > 30 ? " fresh--stale" : ""}`}>
      quote <span className="num">{seconds}</span>s old
    </span>
  );
}
