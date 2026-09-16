/**
 * What the vault is allowed to say about an order's price.
 *
 * This is the screen's whole vocabulary, and it is deliberately small: the
 * price is absent, it cannot be checked, it was refused, or it was verified —
 * and only the last one carries a number. Showing a green tick beside "price
 * attested" because a blob happened to be attached would be the first lie
 * told by a product whose entire argument is that it does not lie to you. It
 * is also exactly the deception this package exists to defeat: a compromised
 * relayer can attach any bytes it likes, and a signature it cannot forge is
 * the only thing that separates the two cases.
 */
import { assetByMint, decimalsOfMint, symbolOfMint } from "@pixstock/shared";
import type { FeedUpdate } from "./message.js";
import {
  MAX_DEVIATION,
  WARN_DEVIATION,
  deviation as deviationOf,
  formatDeviation,
  impliedPrice,
  oraclePrice,
  severityOf,
} from "./price.js";
import type { TrustedSigner } from "./signers.js";
import { MAX_AGE_SECONDS, verify, type VerifyFailure } from "./verify.js";

export { MAX_AGE_SECONDS, MAX_DEVIATION, WARN_DEVIATION };

/**
 * One line of the order ticket, as the policy engine derived it.
 *
 * These are the amounts from the compiled instructions — the ones that will
 * actually move — which is what makes comparing them to an oracle worth
 * anything.
 */
export interface PricedLine {
  mint: string;
  /** The u64, as a string. */
  rawAmount: string;
  /** The mint's ScaledUiAmount multiplier, or 1. */
  multiplier?: number;
  direction: "in" | "out";
}

/** What the oracle and the order say about one leg. */
export interface LegAttestation {
  symbol: string;
  feedId: number;
  /** USDC per share, implied by the transaction's own amounts. */
  implied: number;
  /** USDC per share, according to Pyth. */
  oracle: number;
  /** Pyth's own uncertainty, in the same units, when it sent one. */
  confidence?: number;
  /** Signed: positive means the order pays more than the oracle says. */
  deviation: number;
  severity: "ok" | "warn" | "refuse";
}

export type AttestationStatus =
  | { state: "absent"; label: string; detail: string }
  | { state: "unverifiable"; label: string; detail: string }
  | { state: "rejected"; label: string; detail: string; reason?: VerifyFailure }
  | {
      state: "verified";
      label: string;
      detail: string;
      /** The worst leg's signed deviation, e.g. 0.012 for +1.2%. */
      deviation: number;
      ageSeconds: number;
      /** True between WARN_DEVIATION and MAX_DEVIATION. */
      warn: boolean;
      legs: LegAttestation[];
    };

export interface AttestationInput {
  /** The Pyth `solana` message that travelled with the order, if any. */
  price?: Uint8Array;
  /** The ticket's lines, in leg order: each leg is a pay line then a receive line. */
  lines?: readonly PricedLine[];
  /** Unix seconds. Defaults to this device's clock, which is the only one it has. */
  now?: number;
  signers?: readonly TrustedSigner[];
  maxAgeSeconds?: number;
}

/**
 * Reports what can honestly be said about the attached price.
 *
 * The signature is checked before anything is read from the payload, and the
 * comparison uses the ticket's amounts rather than the manifest's, so a
 * relayer that lies in both places still cannot move the answer.
 */
export function checkAttestation(input: AttestationInput): AttestationStatus {
  const { price, lines = [], now = Math.floor(Date.now() / 1000), signers, maxAgeSeconds } = input;

  if (!price || price.length === 0) {
    return {
      state: "absent",
      label: "No price attestation",
      detail:
        "This order arrived with no signed price. The vault cannot tell whether the amounts " +
        "reflect the market.",
    };
  }

  const result = verify(price, {
    now,
    ...(signers ? { signers } : {}),
    ...(maxAgeSeconds !== undefined ? { maxAgeSeconds } : {}),
  });

  if (!result.ok) {
    return {
      state: "rejected",
      reason: result.reason,
      label: REFUSAL_LABELS[result.reason],
      detail: result.detail,
    };
  }

  const legs: LegAttestation[] = [];
  const unpriced: string[] = [];

  for (const leg of pairLegs(lines)) {
    const asset = assetByMint(leg.asset.mint);
    if (!asset) {
      unpriced.push(symbolOfMint(leg.asset.mint));
      continue;
    }

    const feed = findFeed(result.payload.feeds, asset.pythFeedId, asset.pythExtFeedId);
    if (!feed?.price || feed.exponent === undefined) {
      unpriced.push(asset.symbol);
      continue;
    }

    let implied: number;
    try {
      implied = impliedPrice({
        asset: {
          amount: BigInt(leg.asset.rawAmount),
          decimals: decimalsOfMint(leg.asset.mint),
          ...(leg.asset.multiplier !== undefined ? { multiplier: leg.asset.multiplier } : {}),
        },
        quote: {
          amount: BigInt(leg.quote.rawAmount),
          decimals: decimalsOfMint(leg.quote.mint),
          ...(leg.quote.multiplier !== undefined ? { multiplier: leg.quote.multiplier } : {}),
        },
      });
    } catch (err) {
      return {
        state: "rejected",
        label: "This order's amounts cannot be priced",
        detail: (err as Error).message,
      };
    }

    const oracle = oraclePrice(feed.price, feed.exponent);
    const value = deviationOf(implied, oracle);
    legs.push({
      symbol: asset.symbol,
      feedId: feed.feedId,
      implied,
      oracle,
      deviation: value,
      severity: severityOf(value),
      ...(feed.confidence !== undefined
        ? { confidence: oraclePrice(feed.confidence, feed.exponent) }
        : {}),
    });
  }

  if (legs.length === 0) {
    return {
      state: "unverifiable",
      label: "Price signed, but not for this order",
      detail:
        unpriced.length > 0
          ? `The attestation is genuine and current, but carries no price for ${unpriced.join(", ")}.`
          : "The attestation is genuine and current, but there is nothing in this order to compare it against.",
    };
  }

  // The worst leg decides. A basket is one signature: if any line is mispriced
  // the whole thing is, and averaging would hide exactly the leg that matters.
  const worst = legs.reduce((a, b) => (Math.abs(b.deviation) > Math.abs(a.deviation) ? b : a));
  const refused = worst.severity === "refuse";

  return {
    state: "verified",
    label: refused
      ? `Price off the market by ${formatDeviation(worst.deviation)}`
      : `Price verified, ${formatDeviation(worst.deviation)} from Pyth`,
    detail: describe(worst, legs, result.ageSeconds, unpriced),
    deviation: worst.deviation,
    ageSeconds: result.ageSeconds,
    warn: worst.severity === "warn",
    legs,
  };
}

/** Whether a status permits signing under the strict default. */
export function permitsSigning(status: AttestationStatus, strict: boolean): boolean {
  if (status.state === "rejected") return false;
  if (!strict) return true;
  return status.state === "verified" && Math.abs(status.deviation) <= MAX_DEVIATION;
}

const REFUSAL_LABELS: Record<VerifyFailure, string> = {
  malformed: "Price attestation could not be read",
  "bad-signature": "Price attestation is forged",
  "unknown-signer": "Price signed by an unknown key",
  "signer-expired": "Price signed by a retired key",
  stale: "Price attestation is stale",
  "from-the-future": "Price attestation is dated ahead",
};

/**
 * Pairs the ticket's lines into legs.
 *
 * The ticket emits a pay line then a receive line for each leg, so they are
 * taken two at a time; whichever side is not USDC is the one the oracle
 * prices. A leg with no quote side, or with two, is skipped rather than
 * guessed at.
 */
function pairLegs(
  lines: readonly PricedLine[],
): Array<{ asset: PricedLine; quote: PricedLine }> {
  const legs: Array<{ asset: PricedLine; quote: PricedLine }> = [];

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const pair = [lines[i]!, lines[i + 1]!];
    const asset = pair.filter((line) => assetByMint(line.mint));
    const quote = pair.filter((line) => !assetByMint(line.mint));
    if (asset.length === 1 && quote.length === 1) {
      legs.push({ asset: asset[0]!, quote: quote[0]! });
    }
  }

  return legs;
}

/**
 * The feed for an asset, preferring its regular session feed.
 *
 * A stock has two feeds: the one that prices it while the exchange is open,
 * and the extended-hours one. Which is live depends on the clock in New York,
 * which a phone in airplane mode should not be reasoning about — so whichever
 * one Pyth actually signed is the one used.
 */
/**
 * The feed carrying a price for this asset, preferring its own over the
 * extended-hours one.
 *
 * Exported for its test. Every asset shipped today sets `extFeedId` to null —
 * `Crypto.*X/USD` runs seven days a week, so there is no closed session to
 * fall back from — which leaves the second branch unreachable through
 * `checkAttestation`. It stays because an asset priced off an `Equity.US.*`
 * feed would need it, and untested fallbacks are how they rot.
 */
export function findFeed(
  feeds: readonly FeedUpdate[],
  feedId: number,
  extFeedId: number | null,
): FeedUpdate | undefined {
  return (
    feeds.find((feed) => feed.feedId === feedId && feed.price !== undefined) ??
    (extFeedId === null
      ? undefined
      : feeds.find((feed) => feed.feedId === extFeedId && feed.price !== undefined))
  );
}

function describe(
  worst: LegAttestation,
  legs: readonly LegAttestation[],
  ageSeconds: number,
  unpriced: readonly string[],
): string {
  const age = ageSeconds <= 1 ? "a second" : `${Math.round(ageSeconds)} seconds`;
  const scope = legs.length === 1 ? "" : ` (worst of ${legs.length} legs)`;

  const head =
    worst.severity === "refuse"
      ? `${worst.symbol} is priced ${formatDeviation(worst.deviation)} away from Pyth${scope}, ` +
        `past the ${(MAX_DEVIATION * 100).toFixed(0)}% this vault will sign. Signed by Pyth ${age} ago.`
      : `${worst.symbol} is within ${formatDeviation(worst.deviation)} of Pyth${scope}. ` +
        `Signed by Pyth ${age} ago, checked here with no network.`;

  return unpriced.length > 0
    ? `${head} No price was attached for ${unpriced.join(", ")}.`
    : head;
}
