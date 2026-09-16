/**
 * Constants and types shared by the web dApp, the offline vault and the
 * relayer. Addresses verified on mainnet, 12 Sept 2026 — see
 * docs/ARCHITECTURE.md before changing any of them.
 */

export const PROGRAM_IDS = {
  jupiterV6: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  token: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  token2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  associatedToken: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  /** Pyth Lazer / Pro — trusted signers live in the `"storage"` PDA. */
  pythPro: "pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt",
} as const;

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * The quote currency. Not in ASSETS — that list is what you can buy, and USDC
 * is what you buy it with — but every display path needs to name it.
 */
export const USDC = {
  symbol: "USDC",
  name: "USD Coin",
  mint: USDC_MINT,
  decimals: 6,
  tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
} as const;

export interface Asset {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  tokenProgram: string;
  /**
   * Pyth Pro feed id for the xStock itself — `Crypto.TSLAX/USD`, never
   * `Equity.US.TSLA/USD`.
   *
   * These are two different prices and the difference is the whole point. The
   * token being swapped is Backed Finance's xStock, which trades against its
   * underlying at a premium or a discount; Pyth publishes a redemption-rate
   * feed (`Crypto.TSLAX/TSLA.RR`) precisely because the two diverge. Pricing
   * a TSLAx swap off TSLA compares the order to an asset nobody is trading,
   * and a gap past MAX_DEVIATION would refuse an honest order or wave a
   * dishonest one through.
   *
   * It also decides whether there is any price at all. The equity feeds keep
   * the New York session and publish nothing at the weekend; `Crypto.*X/USD`
   * runs seven days, which is when the token actually trades. An order placed
   * on a Saturday had no price to check against, and that was invisible
   * because only one feed was ever entitled.
   *
   * Read from Pyth's own catalogue on 16 Sept 2026:
   * <https://history.pyth-lazer.dourolabs.app/history/v1/symbols>.
   */
  pythFeedId: number;
  /**
   * Pyth Pro feed id for extended hours, `null` where none applies.
   *
   * Null for every asset here: a seven-day feed has no out-of-session window
   * to fall back from. The field and the fallback in `pyth-verify` stay for
   * an asset that has to be priced off an `Equity.US.*` feed.
   */
  pythExtFeedId: number | null;
  /**
   * The mint carries the Token-2022 ScaledUiAmount extension, so its real
   * amount is `raw / 10^decimals * multiplier` and the multiplier lives on
   * chain. Recorded here because it is what lets an OFFLINE vault know that
   * an order which omits the multiplier is hiding one — see `MintFacts`.
   */
  scaledUiAmount: boolean;
  /**
   * The mint has a Token-2022 permanent delegate — the issuer can move these
   * tokens out of any account without the holder's signature.
   *
   * Recorded offline for the same reason as `scaledUiAmount`, and a sharper
   * one: the address travels with the order, so a sender who simply omitted
   * it could silence the warning. This flag is what makes the disclosure
   * unsuppressible. All five verified on mainnet, 12 Sept 2026.
   */
  hasPermanentDelegate: boolean;
}

/**
 * xStocks are Token-2022 mints issued by Backed Finance. They are not
 * available to US/UK/CA/AU persons — see /legal on the web app.
 */
export const ASSETS: readonly Asset[] = [
  {
    symbol: "TSLAx",
    name: "Tesla",
    mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    decimals: 8,
    tokenProgram: PROGRAM_IDS.token2022,
    pythFeedId: 1847,
    pythExtFeedId: null,
    scaledUiAmount: true,
    hasPermanentDelegate: true,
  },
  {
    symbol: "NVDAx",
    name: "NVIDIA",
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    decimals: 8,
    tokenProgram: PROGRAM_IDS.token2022,
    pythFeedId: 1833,
    pythExtFeedId: null,
    scaledUiAmount: true,
    hasPermanentDelegate: true,
  },
  {
    symbol: "AAPLx",
    name: "Apple",
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    decimals: 8,
    tokenProgram: PROGRAM_IDS.token2022,
    pythFeedId: 1792,
    pythExtFeedId: null,
    scaledUiAmount: true,
    hasPermanentDelegate: true,
  },
  {
    symbol: "MSFTx",
    name: "Microsoft",
    mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
    decimals: 8,
    tokenProgram: PROGRAM_IDS.token2022,
    pythFeedId: 3116,
    pythExtFeedId: null,
    scaledUiAmount: true,
    hasPermanentDelegate: true,
  },
  {
    symbol: "SPYx",
    name: "S&P 500 ETF",
    mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    decimals: 8,
    tokenProgram: PROGRAM_IDS.token2022,
    pythFeedId: 1843,
    pythExtFeedId: null,
    scaledUiAmount: true,
    hasPermanentDelegate: true,
  },
] as const;

export function assetBySymbol(symbol: string): Asset | undefined {
  return ASSETS.find((a) => a.symbol === symbol);
}

export function assetByMint(mint: string): Asset | undefined {
  return ASSETS.find((a) => a.mint === mint);
}

/** Display name for any mint the product knows, USDC included. */
export function symbolOfMint(mint: string): string {
  if (mint === USDC_MINT) return USDC.symbol;
  return assetByMint(mint)?.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

/**
 * Does this mint scale its amounts on chain?
 *
 * Answerable offline, from the table above, which is the point: a vault with
 * no network can still tell that an order omitting a multiplier for one of
 * these mints is showing the wrong number.
 */
export function isScaledMint(mint: string): boolean {
  return assetByMint(mint)?.scaledUiAmount ?? false;
}

/** Decimals for any mint the product knows. Throws rather than guess. */
export function decimalsOfMint(mint: string): number {
  if (mint === USDC_MINT) return USDC.decimals;
  const asset = assetByMint(mint);
  if (!asset) throw new Error(`shared: unknown mint ${mint}`);
  return asset.decimals;
}

export type OrderKind = "BUY" | "SELL" | "BASKET";

export type OrderStatus =
  | "BUILT"
  | "AWAITING_SIGNATURE"
  | "SIGNED"
  | "BROADCAST"
  | "CONFIRMED"
  | "FAILED"
  | "EXPIRED";

/**
 * What the relayer read off a mint, carried with the order.
 *
 * None of this is on the transaction, and an air-gapped vault cannot look it
 * up — so it travels, and the vault treats it as a claim rather than a fact.
 * A lie here does not change what gets signed; it changes what the holder
 * believes they are signing, which for this product is the same thing.
 *
 * The defence is not trust, it is disclosure plus a bound: the ticket states
 * the multiplier, says it came from the dApp, and refuses figures outside
 * `PLAUSIBLE_MULTIPLIER` (rule P11).
 */
export interface MintFacts {
  mint: string;
  /** ScaledUiAmount multiplier at `readAt`. */
  multiplier: number;
  /** The multiplier scheduled to take over, when one is still pending. */
  nextMultiplier?: number;
  /** Unix seconds `nextMultiplier` takes over. Present with it or not at all. */
  nextMultiplierAt?: number;
  /** The issuer can move this mint out of any account, unprompted. */
  permanentDelegate?: string;
  /** The issuer has stopped every transfer of this mint. */
  paused?: boolean;
  /** Unix seconds the relayer read the mint. The ticket shows its age. */
  readAt: number;
}

/**
 * The band a ScaledUiAmount multiplier has to fall in to be shown at all.
 *
 * A sanity bound, not a proof. Multipliers accumulate corporate actions —
 * splits, reverse splits, distributions — so they drift and are not
 * necessarily near 1. What this catches is the gross case: a multiplier of
 * 10,000 turning 0.6 shares into 6,000 on the confirmation screen. A lie
 * inside the band is caught by the holder reading the multiplier, which is
 * why the ticket prints it.
 */
export const PLAUSIBLE_MULTIPLIER = { min: 1e-4, max: 1e4 } as const;

/** `null` when the multiplier can be shown, otherwise why it cannot. */
export function multiplierProblem(multiplier: unknown): string | null {
  if (typeof multiplier !== "number" || !Number.isFinite(multiplier)) {
    return "is not a finite number";
  }
  if (multiplier < PLAUSIBLE_MULTIPLIER.min || multiplier > PLAUSIBLE_MULTIPLIER.max) {
    return `is ${multiplier}, outside the plausible range ${PLAUSIBLE_MULTIPLIER.min} to ${PLAUSIBLE_MULTIPLIER.max}`;
  }
  return null;
}

export interface OrderLeg {
  /** Mint being sold. USDC for a BUY. */
  inMint: string;
  /** Mint being bought. USDC for a SELL. */
  outMint: string;
  /** Raw amount of `inMint`, in its smallest unit. */
  inAmount: string;
  /** Expected raw amount of `outMint`, from the Jupiter quote. */
  expectedOutAmount: string;
  /** Floor after slippage. Below this the swap fails rather than fills badly. */
  minOutAmount?: string;
  /** Pyth Pro feed the vault checks this leg's price against. */
  pythFeedId?: number;
}

/**
 * The human-readable description of an order, carried alongside the
 * transaction. The vault NEVER trusts it: it is cross-checked against the
 * decompiled instructions before anything is shown or signed.
 */
export interface OrderManifest {
  kind: OrderKind;
  vault: string;
  legs: OrderLeg[];
  slippageBps: number;
  /** Unix seconds the quote was taken. The vault shows its age on the ticket. */
  createdAt: number;
  /** Who pays fees and rent. The vault checks this is not itself. */
  feePayer?: string;
  /** Durable nonce account, so a signature does not expire while it is read. */
  nonceAccount?: string;
  /** Origin that built the order, shown on the ticket. Never trusted. */
  dapp?: string;
  /**
   * Mint state the vault cannot read for itself. One entry per distinct mint
   * whose amounts are scaled; USDC and anything at a flat 1 is omitted.
   */
  mints?: MintFacts[];
}

/** The facts declared for a mint, or `undefined` when the order omitted it. */
export function factsForMint(
  mints: readonly MintFacts[] | undefined,
  mint: string
): MintFacts | undefined {
  return mints?.find((facts) => facts.mint === mint);
}

/**
 * Scales a raw token amount by a Token-2022 ScaledUiAmount multiplier.
 *
 * Every xStock carries that extension, and none of the multipliers is 1 —
 * measured on mainnet 12 Sept 2026, as the token program itself reports them:
 * AAPLx 1.00326901, MSFTx 1.00590339, NVDAx 1.00170119, SPYx 1.00571456. It
 * is how the issuer applies corporate actions without moving anyone's tokens.
 *
 * Note the mint stores TWO multipliers and a switchover timestamp; the one in
 * force depends on the clock. Reading the first field alone gives the
 * superseded value — see `MintState` in the relayer.
 *
 * Displaying `raw / 10^decimals` is therefore wrong by up to half a percent,
 * which matters for a product whose whole claim is that the amounts on screen
 * are the real ones.
 *
 * The multiplier lives on the mint, so an offline vault cannot read it: it has
 * to travel with the order, and the vault should say where it came from.
 */
export function scaledUiAmount(
  raw: bigint | string,
  decimals: number,
  multiplier: number
): number {
  return Number(scaleRaw(raw, multiplier)) / 10 ** decimals;
}

/**
 * The multiplier is carried as a bigint over this many decimal places.
 *
 * Scaling in floating point would be fine for a share count and wrong for a
 * u64 — `Number(raw)` starts losing whole units past 2^53, and an amount is
 * exactly where that must not happen. Twelve places holds every multiplier
 * measured on mainnet to more precision than the issuer publishes.
 */
const MULTIPLIER_PLACES = 1_000_000_000_000n;

/**
 * Rounds a multiplier to the precision this product carries it at.
 *
 * An f64 read off the mint has seventeen significant digits, and it does not
 * survive the trip: Prisma's JSON round trip returns it at sixteen, so the
 * number the vault is shown differs in its last bit from the number the
 * relayer read. Nothing downstream is harmed by that — it is one part in
 * 10^16 of a figure displayed to eight decimals — but a value that changes on
 * the way is a value nothing can be checked against.
 *
 * Twelve places is what `scaleRaw` applies, so this makes the multiplier
 * PRINTED on the ticket exactly the multiplier APPLIED to the amount above
 * it, and stable through JSON, Postgres and CBOR alike.
 */
export function normaliseMultiplier(multiplier: number): number {
  return Math.round(multiplier * Number(MULTIPLIER_PLACES)) / Number(MULTIPLIER_PLACES);
}

/**
 * Applies a ScaledUiAmount multiplier to a raw amount, staying in integers.
 *
 * Throws on a multiplier that cannot be applied at all. Whether a value is
 * *plausible* is a different question, answered by policy rule P11 — this
 * only refuses the ones arithmetic cannot use.
 */
export function scaleRaw(raw: bigint | string, multiplier: number): bigint {
  if (typeof multiplier !== "number" || !Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error(`shared: cannot scale by ${multiplier}`);
  }
  const value = typeof raw === "string" ? BigInt(raw) : raw;
  if (multiplier === 1) return value;
  return (value * BigInt(Math.round(multiplier * Number(MULTIPLIER_PLACES)))) / MULTIPLIER_PLACES;
}

/**
 * Formats a scaled amount the way the interface shows it.
 *
 * Deliberately `formatAmount` over the scaled figure rather than a separate
 * formatter: the scaled and unscaled amounts sit side by side on the vault's
 * order ticket, and two formatters would put a difference between them that
 * is not in the numbers.
 */
export function formatScaled(
  raw: bigint | string,
  decimals: number,
  multiplier: number,
  maximumFractionDigits = 6
): string {
  return formatAmount(scaleRaw(raw, multiplier), decimals, maximumFractionDigits);
}

/** Formats a raw token amount for display. Pair with the `.num` CSS class. */
export function formatAmount(
  raw: bigint | string,
  decimals: number,
  maximumFractionDigits = 4
): string {
  const value = typeof raw === "string" ? BigInt(raw) : raw;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;

  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, "");

  const text = fractionText
    ? `${whole.toLocaleString("en-US")}.${fractionText}`
    : whole.toLocaleString("en-US");

  return negative ? `-${text}` : text;
}
