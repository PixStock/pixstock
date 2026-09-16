"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ASSETS, USDC_MINT, formatAmount } from "@pixstock/shared";
import { api, RelayerError, type DisplayPrice, type Quote } from "@/lib/api";
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

const QUICK = ["100", "500", "1000"] as const;

/**
 * Four, because four is what was measured and what the relayer accepts.
 *
 * `docs/AGQP-SPEC.md` §3 stops at a four-leg basket, at 1,052 bytes against
 * Solana's 1,232 — and `CreateOrderDto` caps at four for that reason. This
 * said five, and with exactly five assets in the table it was reachable: the
 * builder let someone allocate a fifth line, quote every leg, and then get a
 * 400 back from the relayer at the end of a flow they had completed. A limit
 * the interface knows about is a button that never lights up; a limit only
 * the server knows about is wasted work and a refusal with no lesson in it.
 */
const MAX_LEGS = 4;

export function BasketBuilder() {
  const b = content.basket;
  const t = content.trade;
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
  const [prices, setPrices] = useState<DisplayPrice[]>([]);

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

  // Which feeds our Pyth grant covers, so the warning below is about these
  // legs rather than about a list written here.
  useEffect(() => {
    let cancelled = false;
    api
      .prices()
      .then((result) => !cancelled && setPrices(result.prices))
      .catch(() => {
        // The status strip above already says the relayer is not answering.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  /** The next asset not already in the basket, or nothing left to add. */
  function addLine() {
    const next = ASSETS.find((a) => !lines.some((l) => l.symbol === a.symbol));
    if (next) setLines((current) => [...current, { symbol: next.symbol, percent: 0 }]);
  }

  const canAdd = lines.length < MAX_LEGS && lines.length < ASSETS.length;
  const uncovered = legs
    .filter((leg) => prices.find((p) => p.symbol === leg.symbol)?.unavailable)
    .map((leg) => leg.asset.name);

  return (
    <div className="app-cols">
      <div className="stack-24">
        <div className="row-wrap">
          <span className="eyebrow">{b.presets.label}</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="preset"
              aria-pressed={matches(lines, preset.legs)}
              onClick={() => setLines(preset.legs.map(([symbol, percent]) => ({ symbol, percent })))}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <span className="eyebrow">{b.builder.amountLabel}</span>
          <div className="amount-row">
            <label className="amount-field">
              <span className="sr-only">{b.builder.amountLabel}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="affix">{b.builder.amountUnit}</span>
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
          </div>
        </div>

        <div className={quoting ? "repricing" : undefined} style={{ display: "grid", gap: 14 }}>
          <div className="alloc-head">
            <span className="eyebrow">{b.builder.allocationLabel}</span>
            <span className={`alloc-total${balanced ? "" : " alloc-total--off"}`}>
              <span className="num">{total}%</span> allocated
              {balanced ? "" : ", must add up to 100%"}
            </span>
          </div>

          {/* The split as one shape. Three percentages in three table cells
              were three numbers to compare; this is the comparison. */}
          <div className="alloc-bar" aria-hidden="true">
            {lines
              .filter((line) => line.percent > 0)
              .map((line) => (
                <span
                  key={line.symbol}
                  className={`alloc-seg alloc-seg--${rampIndex(lines, line.symbol)}`}
                  style={{ flex: line.percent }}
                />
              ))}
          </div>

          <div>
            {lines.map((line) => {
              const leg = legs.find((l) => l.symbol === line.symbol);
              const quote = quotes[line.symbol];
              const asset = ASSETS.find((a) => a.symbol === line.symbol)!;
              return (
                <div key={line.symbol} className="alloc-row">
                  <div className="alloc-name">
                    <span
                      className={`alloc-swatch alloc-seg--${rampIndex(lines, line.symbol)}`}
                      aria-hidden="true"
                    />
                    <span className="t">
                      <span className="sym">{line.symbol}</span>
                      <span className="nm">{asset.name}</span>
                    </span>
                  </div>

                  <div className="alloc-pct">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={line.percent}
                      onChange={(e) => setPercent(line.symbol, Number(e.target.value))}
                      aria-label={`${line.symbol} allocation`}
                    />
                    <span className="v">{line.percent}%</span>
                  </div>

                  <div className="alloc-spend">
                    {leg ? `${formatAmount(leg.inAmount, 6)} USDC` : "—"}
                  </div>

                  <div className="alloc-get">
                    <span className="v">
                      {quote
                        ? `${formatAmount(quote.out.amount, asset.decimals, 6)} ${line.symbol}`
                        : "—"}
                    </span>
                    {quote && <span className="via">via {quote.route.join(", ")}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="alloc-foot">
            <button type="button" className="preset" disabled={!canAdd} onClick={addLine}>
              {b.builder.addLabel}
            </button>
            <span className="note">Up to {MAX_LEGS} legs fit in one transaction.</span>
          </div>
        </div>
      </div>

      <div className="app-col--preview">
        <div className={`panel${quoting ? " repricing" : ""}`}>
          <div className="panel-head">
            <span className="eyebrow">The basket</span>
            <span className="panel-chip">
              <span className="num">{legs.length}</span> leg{legs.length === 1 ? "" : "s"} ·{" "}
              <span className="num">1</span> signature
            </span>
          </div>

          <div className="panel-figure">
            <span className="v">{rawTotal ? formatAmount(rawTotal, 6) : "—"}</span>
            <span className="sym">USDC spent in one transaction</span>
          </div>

          <dl className="dl-rows">
            {legs.map((leg) => {
              const quote = quotes[leg.symbol];
              return (
                <div key={leg.symbol}>
                  <dt>{leg.symbol}</dt>
                  <dd className="num">
                    {quote
                      ? `${formatAmount(quote.out.amount, leg.asset.decimals, 6)}`
                      : "—"}
                  </dd>
                </div>
              );
            })}
            <div>
              <dt>{b.builder.maxSlippage}</dt>
              <dd className="num">{worstSlippage(quotes, legs.map((l) => l.symbol))}</dd>
            </div>
            <div>
              <dt>{t.form.networkFee}</dt>
              <dd className="ok">{t.form.feePaid}</dd>
            </div>
          </dl>

          {uncovered.length > 0 && (
            <div className="warnbox">
              <span className="mark" aria-hidden="true">
                !
              </span>
              <span>
                {names(uncovered)} {uncovered.length === 1 ? "has" : "have"} no signed Pyth price
                today. Your phone will name {uncovered.length === 1 ? "it" : "them"} on the ticket
                and ask you to accept that before it signs.
              </span>
            </div>
          )}

          {!balanced && <p className="alert-inline">{b.builder.mustTotal}</p>}
          {error && (
            <p className="alert-inline" role="alert">
              {error}
            </p>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            <button
              type="button"
              className="btn btn--solid app-cta"
              disabled={!balanced || !isValid || sending || Object.keys(quotes).length === 0}
              onClick={() => void send()}
            >
              {sending ? "Building the order…" : b.builder.submit}
            </button>
            <p className="app-cta-note">Your phone decides. This browser cannot sign anything.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Where this leg sits on the neutral ramp. Order, not identity. */
function rampIndex(lines: Line[], symbol: string): number {
  return Math.min(4, lines.findIndex((l) => l.symbol === symbol));
}

/** Whether the current lines are exactly this preset. */
function matches(lines: Line[], preset: readonly (readonly [string, number])[]): boolean {
  if (lines.length !== preset.length) return false;
  return preset.every(([symbol, percent]) =>
    lines.some((l) => l.symbol === symbol && l.percent === percent),
  );
}

/**
 * The worst slippage any leg allows.
 *
 * One signature covers every leg, so the number that matters is the worst of
 * them — averaging would hide exactly the line that gives most away.
 */
function worstSlippage(quotes: Record<string, Quote>, symbols: string[]): string {
  const present = symbols.map((s) => quotes[s]).filter((q): q is Quote => q !== undefined);
  if (present.length === 0) return "—";
  const worst = Math.max(...present.map((q) => q.slippageBps));
  return `${(worst / 100).toFixed(2)}%`;
}

/** "Apple, Nvidia and Microsoft", as anyone would say it out loud. */
function names(items: string[]): string {
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
