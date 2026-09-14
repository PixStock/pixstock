"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ASSETS, USDC_MINT, formatAmount } from "@pixstock/shared";
import { api, RelayerError, type Quote } from "@/lib/api";
import { usePairedVault } from "@/lib/vault";
import { content } from "@/content/site";

const PRESETS = [
  { name: "Tech Giant Index", legs: [["AAPLx", 40], ["NVDAx", 30], ["MSFTx", 30]] },
  { name: "Chips & Cars", legs: [["NVDAx", 60], ["TSLAx", 40]] },
  { name: "The whole market", legs: [["SPYx", 100]] },
] as const;

interface Line {
  symbol: string;
  percent: number;
}

/** USDC has six decimals; the vault checks the u64, not the display. */
function toRawUsdc(amount: string): bigint | null {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return BigInt(Math.round(parsed * 1e6));
}

export function BasketBuilder() {
  const b = content.basket;
  const router = useRouter();
  const { vault, isValid } = usePairedVault();

  const [amount, setAmount] = useState("500");
  const [lines, setLines] = useState<Line[]>(
    PRESETS[0].legs.map(([symbol, percent]) => ({ symbol, percent })),
  );
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const total = lines.reduce((sum, line) => sum + line.percent, 0);
  const balanced = total === 100;
  const rawTotal = useMemo(() => toRawUsdc(amount), [amount]);

  /** Each leg's share of the total, in raw USDC. */
  const legs = useMemo(() => {
    if (!rawTotal) return [];
    return lines
      .filter((line) => line.percent > 0)
      .map((line) => ({
        ...line,
        asset: ASSETS.find((a) => a.symbol === line.symbol)!,
        inAmount: (rawTotal * BigInt(line.percent)) / 100n,
      }));
  }, [lines, rawTotal]);

  // One quote per leg. Debounced, because dragging a slider is not an
  // intention to price.
  useEffect(() => {
    let cancelled = false;

    // Everything inside the timer: setting state in the effect body itself is
    // what cascades renders.
    const timer = setTimeout(() => {
      if (legs.length === 0 || !balanced) {
        setQuotes({});
        return;
      }
      setQuoting(true);
      Promise.all(
        legs.map((leg) =>
          api
            .quote({ in: USDC_MINT, out: leg.asset.mint, amount: leg.inAmount.toString() })
            .then((quote) => [leg.symbol, quote] as const),
        ),
      )
        .then((entries) => {
          if (cancelled) return;
          setQuotes(Object.fromEntries(entries));
          setError(null);
        })
        .catch((err: RelayerError) => {
          if (cancelled) return;
          setQuotes({});
          setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [legs, balanced]);

  async function send() {
    if (!isValid || legs.length === 0 || !balanced) return;
    setSending(true);
    setError(null);
    try {
      const order = await api.createOrder({
        vault,
        legs: legs.map((leg) => ({
          inMint: USDC_MINT,
          outMint: leg.asset.mint,
          inAmount: leg.inAmount.toString(),
        })),
      });
      router.push(`/sign/${order.orderId}`);
    } catch (err) {
      setError((err as RelayerError).message);
      setSending(false);
    }
  }

  const setPercent = (symbol: string, percent: number) =>
    setLines((current) => current.map((l) => (l.symbol === symbol ? { ...l, percent } : l)));

  return (
    <div className="stack-24">
      <div className="row-wrap">
        <span className="eyebrow">{b.presets.label}</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="btn"
            onClick={() => setLines(preset.legs.map(([symbol, percent]) => ({ symbol, percent })))}
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div className="field-row">
        <label className="field-block" style={{ maxWidth: 280 }}>
          <span className="eyebrow">{b.builder.amountLabel}</span>
          <span className="input-affix">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input num"
            />
            <span className="affix">{b.builder.amountUnit}</span>
          </span>
        </label>
      </div>

      <table className={`spec-table${quoting ? " quote-stale" : ""}`}>
        <thead>
          <tr>
            <th scope="col">Asset</th>
            <th scope="col">{b.builder.allocationLabel}</th>
            <th scope="col">Spends</th>
            <th scope="col">Receives</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const leg = legs.find((l) => l.symbol === line.symbol);
            const quote = quotes[line.symbol];
            const asset = ASSETS.find((a) => a.symbol === line.symbol)!;
            return (
              <tr key={line.symbol}>
                <td>
                  <strong>{line.symbol}</strong>
                  <br />
                  <span className="muted">{asset.name}</span>
                </td>
                <td>
                  <span className="slider-row">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={line.percent}
                      onChange={(e) => setPercent(line.symbol, Number(e.target.value))}
                      aria-label={`${line.symbol} allocation`}
                    />
                    <span className="num">{line.percent}%</span>
                  </span>
                </td>
                <td className="num">
                  {leg ? `${formatAmount(leg.inAmount, 6)} USDC` : "—"}
                </td>
                <td className="num">
                  {quote ? (
                    <>
                      {formatAmount(quote.out.amount, asset.decimals, 6)} {line.symbol}
                      <br />
                      <span className="muted" style={{ fontSize: 12 }}>
                        {quote.route.join(" → ")}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>{b.builder.totalLabel}</td>
            <td className={balanced ? "num" : "num sev--2"}>{total}%</td>
            <td className="num">{rawTotal ? `${formatAmount(rawTotal, 6)} USDC` : "—"}</td>
            <td className="muted">
              {legs.length} leg{legs.length === 1 ? "" : "s"}, one signature
            </td>
          </tr>
        </tfoot>
      </table>

      {!balanced && <p className="alert-inline">{b.builder.mustTotal}</p>}
      {error && (
        <p className="alert-inline" role="alert">
          {error}
        </p>
      )}

      <div className="row-wrap">
        <button
          type="button"
          className="btn btn--solid"
          disabled={!balanced || !isValid || sending || Object.keys(quotes).length === 0}
          onClick={() => void send()}
        >
          {sending ? "Building the order…" : b.builder.submit}
        </button>
        {!isValid && (
          <span className="muted">Paste your vault&apos;s public key first.</span>
        )}
      </div>
    </div>
  );
}
