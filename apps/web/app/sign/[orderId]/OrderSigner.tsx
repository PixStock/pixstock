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
import { AppShell, type RailStep } from "@/components/AppShell";
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

  // A transaction that has left is not yet a transaction that landed. While
  // the cluster has not answered, the order is read back until it has — the
  // relayer settles the row on each read, so this converges even if the
  // process that sent it has since restarted.
  useEffect(() => {
    if (submitted?.status !== "BROADCAST") return;

    let live = true;
    const timer = setInterval(() => {
      api
        .order(orderId)
        .then((fresh) => {
          if (live) setSubmitted(fresh);
        })
        .catch(() => {
          // A blip while polling is not news; the next tick asks again.
        });
    }, 1_500);

    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [orderId, submitted?.status]);

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
          // The signed price, passed through byte for byte. This app cannot
          // forge it and cannot usefully edit it: the vault checks Pyth's
          // signature over these exact bytes, with no network of its own.
          ...(order.attestation
            ? { price: Uint8Array.from(atob(order.attestation), (c) => c.charCodeAt(0)) }
            : {}),
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

  const shell = {
    current: "sign" as const,
    eyebrow: "AGQP v1",
    title: "Show this to your phone",
    lede:
      "Point the vault camera at this screen. The frames cycle, so it can join " +
      "anywhere — there is nothing to time and nothing to click.",
    session: encodeSessionId(sid),
  };

  if (problem && !order) {
    return (
      <AppShell {...shell} step={2}>
        <p className="alert-inline" role="alert">
          {problem}
        </p>
      </AppShell>
    );
  }

  if (!order || !payload) {
    return (
      <AppShell {...shell} step={2}>
        <p className="muted">Loading the order…</p>
      </AppShell>
    );
  }

  const settled = submitted ?? order;

  const spent = order.manifest.legs.reduce((sum, leg) => sum + BigInt(leg.inAmount), 0n);

  // Two once it is on screen, four once it has left for the cluster.
  const step: RailStep = submitted ? 4 : 2;

  return (
    <AppShell {...shell} step={step}>
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
            <dd>{STATUS_LABELS[settled.status]}</dd>
          </div>
        </dl>
      </div>

      {submitted ? (
        <div className="notice">
          <h3>{HEADLINES[submitted.status] ?? "Signature accepted"}</h3>
          <p className="copy">{BODY[submitted.status] ?? BODY.SIGNED}</p>

          {submitted.explorerUrls.map((url, i) => (
            <p key={url} style={{ margin: 0 }}>
              <a href={url} target="_blank" rel="noreferrer">
                {submitted.explorerUrls.length > 1
                  ? `Transaction ${i + 1} on Solscan`
                  : "See it on Solscan"}
              </a>{" "}
              <span className="muted num">{truncate(submitted.txSignatures[i] ?? "")}</span>
            </p>
          ))}

          {submitted.error && (
            <p className="alert-inline" role="alert">
              {submitted.error}
            </p>
          )}

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
    </AppShell>
  );
}

/**
 * What each status means to someone watching, rather than to the database.
 *
 * BROADCAST is the one that matters: it says the transaction has left and the
 * cluster has not answered yet, which is true for about a second and must not
 * read as "done".
 */
const STATUS_LABELS: Record<Order["status"], string> = {
  BUILT: "Built",
  AWAITING_SIGNATURE: "Waiting for your vault",
  SIGNED: "Signed, not sent",
  BROADCAST: "Sent — waiting for the cluster",
  CONFIRMED: "Confirmed on chain",
  FAILED: "Failed",
  EXPIRED: "Expired",
};

const HEADLINES: Partial<Record<Order["status"], string>> = {
  SIGNED: "Signature accepted",
  BROADCAST: "Sent to Solana",
  CONFIRMED: "Confirmed on chain",
  FAILED: "It did not go through",
};

const BODY: Record<string, string> = {
  SIGNED: "The relayer checked it against the message it built and stored it.",
  BROADCAST: "The relayer co-signed and sent it. Waiting for the cluster to confirm.",
  CONFIRMED: "The relayer paid the fees. Your vault's SOL balance is untouched.",
  FAILED: "Nothing was signed away — the details are below.",
};

/** Enough of a signature to recognise it, never enough to retype it wrongly. */
function truncate(signature: string): string {
  return signature.length > 16 ? `${signature.slice(0, 8)}…${signature.slice(-8)}` : signature;
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
