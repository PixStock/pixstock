/**
 * What the order says a share costs, against what the oracle says it costs.
 *
 * The implied price comes from the transaction's own amounts — the ones the
 * policy engine read out of the compiled instructions, never the ones the
 * manifest claims. That is the whole trick: a relayer can write anything it
 * likes in a manifest, but the amounts it must put in the instructions are
 * the amounts that will actually move.
 */

/** Above this the vault refuses to sign. See docs/THREAT-MODEL.md. */
export const MAX_DEVIATION = 0.01;
/** Between this and the maximum, the vault warns but allows. */
export const WARN_DEVIATION = 0.005;

export interface Side {
  /** The u64 as it appears in the instruction. */
  amount: bigint;
  decimals: number;
  /**
   * The mint's ScaledUiAmount multiplier, or 1.
   *
   * An xStock's raw balance is not the number of shares: the multiplier is
   * what turns one into the other, and leaving it out moves the implied price
   * by however far the mint has scaled — half a percent today, which is half
   * the whole tolerance.
   */
  multiplier?: number;
}

export interface LegPrice {
  /** The stock side of the leg, priced by the feed. */
  asset: Side;
  /** The USDC side. */
  quote: Side;
}

/**
 * Turns a raw u64 into the number a human would read.
 *
 * Refuses rather than rounds: past 2^53 a double silently stops counting in
 * ones, and a price check that is quietly wrong is worse than no price check.
 */
export function toDecimal({ amount, decimals, multiplier = 1 }: Side): number {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      `pyth-verify: ${amount} is too large to price exactly; this vault will not guess`,
    );
  }
  return (Number(amount) / 10 ** decimals) * multiplier;
}

/** USDC paid per share, from the amounts the transaction actually moves. */
export function impliedPrice(leg: LegPrice): number {
  const asset = toDecimal(leg.asset);
  if (asset === 0) {
    throw new RangeError("pyth-verify: a leg that receives nothing has no price");
  }
  return toDecimal(leg.quote) / asset;
}

/** The oracle's price for a feed: mantissa and exponent, as Pyth sends them. */
export function oraclePrice(mantissa: bigint, exponent: number): number {
  return Number(mantissa) * 10 ** exponent;
}

/** Signed relative deviation, e.g. 0.012 for +1.2% — the order costing more than the oracle. */
export function deviation(implied: number, oracle: number): number {
  if (oracle === 0) {
    throw new RangeError("pyth-verify: the oracle quoted zero, which cannot be compared against");
  }
  return (implied - oracle) / oracle;
}

/** How a deviation should be treated. Both directions count: see the note. */
export function severityOf(value: number): "ok" | "warn" | "refuse" {
  // Symmetric deliberately. Paying above the market is the obvious theft; an
  // order that claims to hand over far more than the market would is either a
  // fabricated quote or a route that will fail, and neither should be signed
  // blind.
  const magnitude = Math.abs(value);
  if (magnitude > MAX_DEVIATION) return "refuse";
  if (magnitude > WARN_DEVIATION) return "warn";
  return "ok";
}

/** `+1.20%`, for a screen. */
export function formatDeviation(value: number): string {
  const percent = value * 100;
  const rounded = Math.abs(percent) < 0.01 ? 0 : percent;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(2)}%`;
}
