"use client";

import { useEffect, useMemo, useState } from "react";
import { encodePayload, encodeSessionId, newSessionId } from "@pixstock/agqp";
import {
  factsForMint,
  formatAmount,
  formatScaled,
  isScaledMint,
  type MintFacts,
} from "@pixstock/shared";
import { api, RelayerError, type Order } from "@/lib/api";
import { AnimatedQr } from "@/components/AnimatedQr";
import { SignatureScanner } from "@/components/SignatureScanner";

/**
 * A real order on its way across the gap.
 *
 * The session id is minted here and travels in both the frames and the CBOR
 * payload, so the vault can confirm the two agree and a reply from another
 * session is recognisable as such.
 */
export function OrderSigner({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Order | null>(null);

  useEffect(() => {
    api
      .order(orderId)
      .then(setOrder)
      .catch((err: RelayerError) => setError(err.message));
  }, [orderId]);

  const sid = useMemo(() => newSessionId(), []);

  // Encoding is pure, so it happens during render. Returning the failure
  // rather than setting state keeps it out of an effect.
  const encoded = useMemo((): { payload: Uint8Array | null; error: string | null } => {
    if (!order) return { payload: null, error: null };
    try {
      return {
        error: null,
        payload: encodePayload({
          kind: "SIGN",
          sid,
          vault: order.vault,
          txs: order.txMessages.map((m) => Uint8Array.from(atob(m), (c) => c.charCodeAt(0))),
          manifest: {
            kind: order.manifest.kind,
            legs: order.manifest.legs.map((leg) => ({
              inMint: leg.inMint,
              outMint: leg.outMint,
              inAmount: leg.inAmount,
              expectedOutAmount: leg.expectedOutAmount,
              minOutAmount: leg.minOutAmount,
            })),
            slippageBps: order.manifest.slippageBps,
            feePayer: order.manifest.feePayer,
            dapp: order.manifest.dapp,
            quotedAt: order.manifest.quotedAt,
            // Straight through from the relayer. The multiplier decides what
            // the vault's ticket says you receive, and an air-gapped device
            // cannot read it off the mint for itself.
            mints: order.manifest.mints,
          },
          // No attestation: the price stream is not built, and the vault says
          // so rather than showing a tick it has not earned.
        }),
      };
    } catch (err) {
      return { payload: null, error: (err as Error).message };
    }
  }, [order, sid]);

  const payload = encoded.payload;
  const problem = error ?? encoded.error;

  async function submit(signatures: Uint8Array[]) {
    setSubmitting(true);
    try {
      const updated = await api.submitSignature(
        orderId,
        signatures.map((s) => btoa(String.fromCharCode(...s))),
      );
      setSubmitted(updated);
      setError(null);
    } catch (err) {
      const relayerError = err as RelayerError;
      setError(
        relayerError.violations?.length
          ? `${relayerError.message}: ${relayerError.violations.map((v) => `${v.rule} ${v.detail}`).join("; ")}`
          : relayerError.message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (problem && !order) {
    return (
      <p className="alert-inline" role="alert">
        {problem}
      </p>
    );
  }

  if (!order || !payload) return <p className="muted">Loading the order…</p>;

  const spent = order.manifest.legs.reduce((sum, leg) => sum + BigInt(leg.inAmount), 0n);

  return (
    <div className="stack-24">
      <div className="quote-card">
        <span className="eyebrow">{order.kind}</span>
        <p className="quote-out num" style={{ margin: 0 }}>
          {formatAmount(spent, 6)} <span style={{ fontSize: 18 }}>USDC</span>
        </p>
        <dl style={{ margin: 0, display: "grid", gap: 6 }}>
          {order.manifest.legs.map((leg) => (
            <div key={leg.outMint} className="quote-row">
              <dt>
                {formatAmount(leg.inAmount, 6)} USDC via {leg.route.join(" → ")}
              </dt>
              <dd className="num">
                {formatScaled(
                  leg.expectedOutAmount,
                  leg.decimals,
                  multiplierFor(order.manifest.mints, leg.outMint),
                )}{" "}
                {leg.symbol}
              </dd>
            </div>
          ))}
          <div className="quote-row">
            <dt>Status</dt>
            <dd>{submitted?.status ?? order.status}</dd>
          </div>
        </dl>
      </div>

      {submitted ? (
        <div className="notice">
          <h3>Signature accepted</h3>
          <p className="copy">
            The relayer checked it against the message it built and stored it.
          </p>
          {submitted.pending?.map((line) => (
            <p key={line} className="alert-inline">
              {line}
            </p>
          ))}
        </div>
      ) : (
        <>
          <AnimatedQr payload={payload} sid={sid} />

          <div
            style={{
              display: "grid",
              gap: 12,
              borderTop: "1px solid var(--rule)",
              paddingTop: 24,
            }}
          >
            <span className="eyebrow">Return channel</span>
            <p style={{ margin: 0, color: "var(--ink-2)" }}>
              The vault answers with a single static QR holding sixty-four bytes.
              Hold it up to the webcam.
            </p>
            <SignatureScanner
              expectedSid={encodeSessionId(sid)}
              onSignatures={(signatures) => void submit(signatures)}
              busy={submitting}
            />
          </div>
        </>
      )}

      {problem && (
        <p className="alert-inline" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * The multiplier to show an amount with, or 1.
 *
 * Applied only where the shared table says the mint scales, exactly as the
 * vault does it — the two screens must not be able to disagree.
 */
function multiplierFor(mints: MintFacts[] | undefined, mint: string): number {
  if (!isScaledMint(mint)) return 1;
  return factsForMint(mints, mint)?.multiplier ?? 1;
}
