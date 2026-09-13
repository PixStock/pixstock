"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ASSETS, USDC_MINT, formatAmount } from "@pixstock/shared";
import { api, RelayerError, type DisplayPrice, type Quote } from "@/lib/api";
import { usePairedVault } from "@/lib/vault";
import { VaultField } from "@/components/VaultField";
import { RelayerStatus } from "@/components/RelayerStatus";
import { content } from "@/content/site";

/** USDC has six decimals; a u64 of them is what the vault will check. */
function toRawUsdc(amount: string): string | null {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return BigInt(Math.round(parsed * 1e6)).toString();
}

export function TradeForm() {
  const t = content.trade;
  const router = useRouter();
  const { vault, setVault, isValid } = usePairedVault();

  const [symbol, setSymbol] = useState(ASSETS[0]!.symbol);
  const [amount, setAmount] = useState("50");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const asset = ASSETS.find((a) => a.symbol === symbol)!;
  const rawAmount = useMemo(() => toRawUsdc(amount), [amount]);
  const [price, setPrice] = useState<DisplayPrice | null>(null);

  // Pyth's own price, beside the route's. Shown so the two can be compared by
  // eye; neither is proof of anything here, and the phone is what checks the
  // signature that makes one of them evidence.
  useEffect(() => {
    let cancelled = false;

    const read = () =>
      api
        .prices([symbol])
        .then((result) => !cancelled && setPrice(result.prices[0] ?? null))
        .catch(() => {
          // The relayer already has a status banner of its own on this page.
        });

    void read();
    const timer = setInterval(read, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol]);

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

  return (
    <div className="stack-24">
      <RelayerStatus />

      <div className="field-row">
        <label className="field-block">
          <span className="eyebrow">{t.form.assetLabel}</span>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="select">
            {ASSETS.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol} — {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field-block">
          <span className="eyebrow">{t.form.amountLabel}</span>
          <span className="input-affix">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input num"
            />
            <span className="affix">{t.form.amountUnit}</span>
          </span>
        </label>
      </div>

      <VaultField vault={vault} onChange={setVault} />

      {quote && (
        <div className={`quote-card${quoting ? " quote-stale" : ""}`}>
          <span className="eyebrow">You receive</span>
          <p className="quote-out num" style={{ margin: 0 }}>
            {formatAmount(quote.out.amount, asset.decimals, 6)}{" "}
            <span style={{ fontSize: 18 }}>{quote.out.symbol}</span>
          </p>
          <dl style={{ margin: 0, display: "grid", gap: 6 }}>
            <div className="quote-row">
              <dt>At worst</dt>
              <dd className="num">
                {formatAmount(quote.minOutAmount, asset.decimals, 6)} {quote.out.symbol}
              </dd>
            </div>
            <div className="quote-row">
              <dt>Route</dt>
              <dd>{quote.route.join(" → ")}</dd>
            </div>
            <div className="quote-row">
              <dt>Price impact</dt>
              <dd className="num">{(Number(quote.priceImpactPct) * 100).toFixed(3)}%</dd>
            </div>
            <div className="quote-row">
              <dt>Network fee</dt>
              <dd>paid by the relayer</dd>
            </div>
            <div className="quote-row">
              <dt>Pyth price</dt>
              <dd className="num">
                {price?.symbol !== symbol ? (
                  <span className="muted">…</span>
                ) : price.unavailable ? (
                  <span className="muted">{price.unavailable}</span>
                ) : (
                  <>
                    {price.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                    <span className="muted">
                      {price.session === "ext" ? "extended hours" : "live"}
                    </span>
                  </>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {error && (
        <p className="alert-inline" role="alert">
          {error}
        </p>
      )}

      <div className="row-wrap">
        <button
          type="button"
          className="btn btn--solid"
          disabled={!quote || !isValid || sending}
          onClick={() => void send()}
        >
          {sending ? "Building the order…" : t.form.submit}
        </button>
        {!isValid && (
          <span className="muted">Paste your vault&apos;s public key first.</span>
        )}
      </div>
    </div>
  );
}
