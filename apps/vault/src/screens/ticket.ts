/**
 * What the review screen computes, separated from what it draws.
 *
 * These decide what a holder is told and what they are allowed to do about
 * it, so they are the part of this screen worth asserting directly rather
 * than through a browser. `canAcknowledge` is the reason this file exists: it
 * is one line, it decides whether a refusal can be overridden at all, and its
 * own comment warns that widening it would undo the guard silently. Nothing
 * was checking that it had not been widened.
 */
import {
  formatDeviation,
  type AttestationStatus,
  type LegAttestation,
} from "@pixstock/pyth-verify";
import { assetByMint, formatScaled } from "@pixstock/shared";
import type { PolicyResult, TicketLine } from "@pixstock/tx-policy";

export type CheckState = "ok" | "warn" | "bad";

/** Why it refuses, in the same order the checks run. */
export function refusalDetail(
  violations: PolicyResult["violations"],
  price: AttestationStatus,
  tolerance: number,
): string {
  if (violations.length > 0) {
    return `${violations[0]!.detail}. There is no checkbox for this.`;
  }

  if (price.state === "verified") {
    const worst = worstLeg(price);
    if (worst) {
      // The two numbers side by side, because "4.20% away" on its own is a
      // statistic and "439.60 against 421.88" is the thing that is wrong.
      return (
        `The order prices ${worst.symbol} at ${worst.implied.toFixed(2)}. ` +
        `Pyth signed ${worst.oracle.toFixed(2)} ${price.ageSeconds} second` +
        `${price.ageSeconds === 1 ? "" : "s"} ago — ${formatDeviation(worst.deviation)} away, ` +
        `past the ${(tolerance * 100).toFixed(1)}% you allow. There is no checkbox for this.`
      );
    }
  }

  return `${price.detail} There is no checkbox for this.`;
}

export function worstLeg(price: AttestationStatus): LegAttestation | null {
  if (price.state !== "verified" || price.legs.length === 0) return null;
  return price.legs.reduce((a, b) => (Math.abs(b.deviation) > Math.abs(a.deviation) ? b : a));
}

export function severityOfWorst(price: AttestationStatus): "ok" | "warn" | "refuse" {
  return worstLeg(price)?.severity ?? "ok";
}

/**
 * The legs' pay lines as one figure, when that is exactly true.
 *
 * Every leg of a basket spends the same USDC, so three rows saying "You pay"
 * are one fact written three times. Returns null the moment the mints or the
 * multipliers differ: a total across different things is not a total.
 */
export function totalPaid(pay: TicketLine[]): { amount: string; symbol: string } | null {
  if (pay.length === 0) return null;

  const first = pay[0]!;
  if (pay.some((l) => l.mint !== first.mint || l.multiplier !== first.multiplier)) return null;

  const raw = pay.reduce((sum, l) => sum + BigInt(l.rawAmount), 0n);
  return {
    // The same fallback buildTicket uses, and for the same two reasons: a
    // ticket may legitimately carry a mint the offline table does not know,
    // and `decimalsOfMint` throws on one. A throw here would unmount the
    // review screen mid-render — a blank page, with no Reject button, at the
    // exact moment someone is deciding whether to sign.
    //
    // Sharing the expression also keeps the total formatted like the lines
    // it totals.
    amount: formatScaled(raw, assetByMint(first.mint)?.decimals ?? 6, first.multiplier),
    symbol: first.symbol,
  };
}

/**
 * What one unit costs, and what the scale did to the figure above.
 *
 * The per-unit price is the one the vault derived from the transaction's own
 * amounts, so it only exists where a price verified. Where it does not, the
 * clause is dropped rather than filled with the manifest's claim.
 */
export function perUnit(line: TicketLine, price: AttestationStatus): string {
  const parts: string[] = [];

  if (price.state === "verified") {
    const leg = price.legs.find((l) => l.symbol === line.symbol);
    if (leg) parts.push(`at ${leg.implied.toFixed(2)} each`);
  }

  if (line.multiplier !== 1) {
    parts.push(
      `×${Number(line.multiplier.toFixed(6))} scale applied, ${line.unscaledAmount} unscaled`,
    );
  }

  return parts.join(" · ");
}

/** The asset's name, for the line under the figure. */
export function nameOf(symbol: string): string {
  return NAMES[symbol] ?? symbol;
}

/**
 * How stale the mint reading is. Multipliers change; this says when.
 *
 * `now` is a parameter so the arithmetic can be asserted without a fake
 * clock. Callers pass nothing.
 */
export function mintAgeMinutes(readAt: number, now = Date.now() / 1000): number {
  return Math.max(0, Math.round((now - readAt) / 60));
}

/**
 * Whether the holder may take responsibility for an unchecked price.
 *
 * Only where the vault could not check: no attestation, or one that is
 * genuine but carries no price for this asset. A price that was checked and
 * came back wrong is not on this list, and adding it later would quietly undo
 * the guard.
 */
export function canAcknowledge(status: AttestationStatus): boolean {
  return status.state === "absent" || status.state === "unverifiable";
}

export function priceCheckState(status: AttestationStatus): CheckState {
  if (status.state === "verified") return status.warn ? "warn" : "ok";
  if (status.state === "rejected") return "bad";
  // Absent or unverifiable: a warning, never a tick.
  return "warn";
}

const NAMES: Record<string, string> = {
  TSLAx: "Tesla",
  NVDAx: "NVIDIA",
  AAPLx: "Apple",
  MSFTx: "Microsoft",
  SPYx: "S&P 500 ETF",
  USDC: "USD Coin",
};
