"use client";

import { useEffect, useMemo, useState } from "react";
import { CHUNK_SIZES, DEFAULT_FPS, encodePayload, encodeSessionId, newSessionId } from "@pixstock/agqp";
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
  // Where the cycle has got to. The bar below the code is driven from this,
  // and step one of the phone rail can only be inferred from it: nothing
  // here can see the phone, so "shown" is the honest word, not "read".
  const [cycle, setCycle] = useState<{ frames: number; index: number } | null>(null);
  const [cycled, setCycled] = useState(false);

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
    eyebrow: "Crossing the gap",
    title: "Show this screen to your phone",
    lede:
      "Hold the phone up to the code. The frames repeat, so it can join anywhere. " +
      "Nothing to time, nothing to click.",
    session: encodeSessionId(sid),
    // The order is already built by the time anyone reads this, so the first
    // two steps name states rather than things to go and do.
    railLabels: ["Built", "Showing", "Phone signs", "We broadcast"] as const,
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
      <div className="app-cols app-cols--even">
        <figure className="qr-figure">
          <AnimatedQr
            payload={payload}
            sid={sid}
            className="qr-canvas"
            onCycle={(info) => {
              setCycle(info);
              // A full pass means every frame has been on screen at least
              // once, which is the most this side can honestly claim.
              if (info.index === info.frames - 1) setCycled(true);
            }}
          />

          <div className="frames" aria-hidden="true">
            {Array.from({ length: cycle?.frames ?? 0 }, (_, i) => (
              <span
                key={i}
                className={`frame-seg${i <= (cycle?.index ?? -1) ? " frame-seg--got" : ""}`}
              />
            ))}
          </div>

          <figcaption className="qr-caption">
            <span className="l">
              Frame <span className="num">{(cycle?.index ?? 0) + 1}</span> of{" "}
              <span className="num">{cycle?.frames ?? "?"}</span> · the cycle restarts every{" "}
              <span className="num">{cycleSeconds(cycle?.frames)}</span>s
            </span>
            <span className="r">
              {CHUNK_SIZES.M} B · {DEFAULT_FPS} fps
            </span>
          </figcaption>
        </figure>

        <div className="stack-24">
          <div className="inside-card">
            <span className="eyebrow">What is inside this code</span>
            <span className="v">{formatAmount(spent, 6)} USDC</span>
            <span className="d">
              into {legWord(order.manifest.legs.length)}, one signature
            </span>
            <dl className="dl-rows">
              {order.manifest.legs.map((leg) => (
                <div key={leg.outMint}>
                  <dt>{leg.symbol}</dt>
                  <dd className="num">
                    {formatScaled(
                      leg.expectedOutAmount,
                      leg.decimals,
                      multiplierFor(order.manifest.mints, leg.outMint),
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {submitted ? (
            <div className="notice">
              <h3>{HEADLINES[submitted.status] ?? "Signature accepted"}</h3>
              <p className="copy">{BODY[submitted.status] ?? BODY.SIGNED}</p>
              <p className="muted" style={{ margin: 0 }}>
                {STATUS_LABELS[settled.status]}
              </p>

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
              <div>
                <span className="eyebrow">On the phone, right now</span>
                <div className="phone-rail">
                  <PhoneStep
                    index={1}
                    state={cycled ? "done" : "current"}
                    title="Open the vault and point the camera here"
                    detail={
                      cycle
                        ? `${cycle.frames} of ${cycle.frames} frames shown`
                        : "building the frames…"
                    }
                  />
                  <PhoneStep
                    index={2}
                    state={cycled ? "current" : "pending"}
                    title="Read the ticket it prints, then approve"
                    detail="It checks the price against Pyth with no network of its own"
                  />
                  <PhoneStep
                    index={3}
                    state="pending"
                    title="Hold its answer up to your webcam"
                    detail="Sixty-four bytes come back, nothing else"
                  />
                </div>
              </div>

              <SignatureScanner
                expectedSid={encodeSessionId(sid)}
                onSignatures={(signatures) => void submit(signatures)}
                busy={submitting}
              />
            </>
          )}

          {problem && (
            <p className="alert-inline" role="alert">
              {problem}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/**
 * One row of what the holder is doing.
 *
 * Step one is the only one this side can infer at all, and only optically —
 * so it says "shown", not "read". Nothing here can see the phone.
 */
function PhoneStep({
  index,
  state,
  title,
  detail,
}: {
  index: number;
  state: "done" | "current" | "pending";
  title: string;
  detail: string;
}) {
  return (
    <div className={`phone-step phone-step--${state}`}>
      <span className="phone-mark" aria-hidden="true">
        {state === "done" ? "✓" : index}
      </span>
      <span className="t">
        <b>{title}</b>
        <span>{detail}</span>
      </span>
    </div>
  );
}

/** How long one full pass takes, so "the cycle restarts every" is true. */
function cycleSeconds(frames: number | undefined): string {
  if (!frames) return "?";
  return (frames / DEFAULT_FPS).toFixed(1);
}

/** "three positions", "one position". */
function legWord(count: number): string {
  const names = ["no", "one", "two", "three", "four", "five"];
  return `${names[count] ?? count} position${count === 1 ? "" : "s"}`;
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
  BROADCAST: "Sent, waiting for the cluster",
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
  FAILED: "Nothing was signed away. The details are below.",
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
