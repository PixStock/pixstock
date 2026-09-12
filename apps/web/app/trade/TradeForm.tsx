"use client";

import Link from "next/link";
import { useState } from "react";
import { ASSETS, formatAmount } from "@pixstock/shared";
import { CHUNK_SIZES, DEFAULT_FPS } from "@pixstock/agqp";
import { content } from "@/content/site";

/**
 * Measured on a real mainnet route: a single swap with a fee payer that is not
 * the signer, an ATA creation included, comes to roughly 800 bytes once the
 * manifest and the price attestation travel with it. See docs/AGQP-SPEC.md §3.
 */
const SINGLE_SWAP_PAYLOAD_BYTES = 800;

export function TradeForm() {
  const t = content.trade;
  const [symbol, setSymbol] = useState(ASSETS[0]!.symbol);
  const [amount, setAmount] = useState("50");

  const asset = ASSETS.find((a) => a.symbol === symbol)!;
  const frames = Math.ceil(SINGLE_SWAP_PAYLOAD_BYTES / CHUNK_SIZES.M);

  // USDC has six decimals. Shown so the figure the vault will check is visible
  // here too, rather than only appearing after the order is built.
  const rawAmount = (() => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return BigInt(Math.round(parsed * 1e6));
  })();

  return (
    <div className="stack-24">
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
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input num"
            />
            <span className="affix">{t.form.amountUnit}</span>
          </span>
        </label>
      </div>

      <div className="notice">
        <h3>{t.pending.title}</h3>
        <p className="copy">{t.pending.body}</p>
      </div>

      <table className="spec-table">
        <thead>
          <tr>
            <th scope="col">{t.form.assetHeaders.symbol}</th>
            <th scope="col">{t.form.assetHeaders.mint}</th>
            <th scope="col">{t.form.assetHeaders.program}</th>
            <th scope="col">{t.form.assetHeaders.feed}</th>
          </tr>
        </thead>
        <tbody>
          {ASSETS.map((a) => (
            <tr key={a.symbol} className={a.symbol === symbol ? "row--active" : undefined}>
              <td>
                <strong>{a.symbol}</strong>
                <br />
                <span className="muted">{a.name}</span>
              </td>
              <td className="mono-cell">{a.mint.slice(0, 8)}…{a.mint.slice(-6)}</td>
              <td>Token-2022</td>
              <td className="num">
                {a.pythFeedId}
                {a.pythExtFeedId !== null && <span className="muted"> / {a.pythExtFeedId}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="notice">
        <h3>{t.channel.title}</h3>
        <p className="copy">{t.channel.body}</p>
        <p className="copy">
          {rawAmount !== null && (
            <>
              <span className="num">{formatAmount(rawAmount, 6)}</span> USDC → {asset.symbol} ·{" "}
            </>
          )}
          <span className="num">{frames}</span> {t.channel.framesLabel}{" "}
          <span className="num">{DEFAULT_FPS}</span> FPS ·{" "}
          <span className="num">{CHUNK_SIZES.M}</span> {t.channel.perFrame}
        </p>
        <Link className="btn btn--solid" href="/sign">
          {t.channel.tryLabel}
        </Link>
      </div>
    </div>
  );
}
