"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ASSETS, formatAmount } from "@pixstock/shared";
import { CHUNK_SIZES } from "@pixstock/agqp";
import { content } from "@/content/site";

/** Measured: a 3-leg basket request runs about 1330 bytes. docs/AGQP-SPEC.md §3. */
const BYTES_PER_LEG = 440;
const BASE_PAYLOAD_BYTES = 340;

const PRESETS = [
  { name: "Tech Giant Index", legs: [["AAPLx", 40], ["NVDAx", 30], ["MSFTx", 30]] },
  { name: "Chips & Cars", legs: [["NVDAx", 60], ["TSLAx", 40]] },
  { name: "The whole market", legs: [["SPYx", 100]] },
] as const;

type Line = { symbol: string; percent: number };

export function BasketBuilder() {
  const b = content.basket;
  const [amount, setAmount] = useState("500");
  const [lines, setLines] = useState<Line[]>(
    PRESETS[0].legs.map(([symbol, percent]) => ({ symbol, percent }))
  );

  const total = lines.reduce((sum, line) => sum + line.percent, 0);
  const balanced = total === 100;

  const rawAmount = useMemo(() => {
    const parsed = Number(amount);
    return Number.isFinite(parsed) && parsed > 0 ? BigInt(Math.round(parsed * 1e6)) : null;
  }, [amount]);

  const frames = Math.ceil((BASE_PAYLOAD_BYTES + lines.length * BYTES_PER_LEG) / CHUNK_SIZES.M);

  const setPercent = (i: number, percent: number) =>
    setLines((current) => current.map((line, j) => (j === i ? { ...line, percent } : line)));

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

      <label className="field-block" style={{ maxWidth: 280 }}>
        <span className="eyebrow">{b.builder.amountLabel}</span>
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
          <span className="affix">{b.builder.amountUnit}</span>
        </span>
      </label>

      <table className="spec-table">
        <thead>
          <tr>
            <th scope="col">Asset</th>
            <th scope="col">{b.builder.allocationLabel}</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const asset = ASSETS.find((a) => a.symbol === line.symbol);
            const legAmount =
              rawAmount === null ? null : (rawAmount * BigInt(line.percent)) / 100n;
            return (
              <tr key={line.symbol}>
                <td>
                  <strong>{line.symbol}</strong>
                  <br />
                  <span className="muted">{asset?.name}</span>
                </td>
                <td>
                  <span className="slider-row">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={line.percent}
                      onChange={(e) => setPercent(i, Number(e.target.value))}
                      aria-label={`${line.symbol} allocation`}
                    />
                    <span className="num">{line.percent}%</span>
                  </span>
                </td>
                <td className="num">
                  {legAmount === null ? "—" : `${formatAmount(legAmount, 6)} USDC`}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>{b.builder.totalLabel}</td>
            <td className={balanced ? "num" : "num sev--2"}>{total}%</td>
            <td className="num">
              {rawAmount === null ? "—" : `${formatAmount(rawAmount, 6)} USDC`}
            </td>
          </tr>
        </tfoot>
      </table>

      {!balanced && <p className="alert-inline">{b.builder.mustTotal}</p>}

      <div className="notice">
        <h3>{b.pending.title}</h3>
        <p className="copy">{b.pending.body}</p>
        <p className="copy">
          <span className="num">{lines.length}</span> legs · one transaction ·{" "}
          <span className="num">{frames}</span> frames
        </p>
        <Link className="btn btn--solid" href="/sign">
          {content.trade.channel.tryLabel}
        </Link>
      </div>
    </div>
  );
}
