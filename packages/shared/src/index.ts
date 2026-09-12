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
  /** Pyth Pro feed id, regular session. */
  pythFeedId: number;
  /** Pyth Pro feed id, extended hours. `null` where no `.EXT` feed exists. */
  pythExtFeedId: number | null;
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
    pythFeedId: 1435,
    pythExtFeedId: 1746,
  },
  {
    symbol: "NVDAx",
    name: "NVIDIA",
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    decimals: 8,
    tokenProgram: PROGRAM_IDS.token2022,
    pythFeedId: 1314,
    pythExtFeedId: 1720,
  },
  {
    symbol: "AAPLx",
    name: "Apple",
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    decimals: 8,
    tokenProgram: PROGRAM_IDS.token2022,
    pythFeedId: 922,
    pythExtFeedId: 1671,
  },
  {
    symbol: "MSFTx",
    name: "Microsoft",
    mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
    decimals: 8,
    tokenProgram: PROGRAM_IDS.token2022,
    pythFeedId: 1292,
    pythExtFeedId: 1716,
  },
  {
    symbol: "SPYx",
    name: "S&P 500 ETF",
    mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    decimals: 8,
    tokenProgram: PROGRAM_IDS.token2022,
    pythFeedId: 1398,
    pythExtFeedId: null,
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
}

/**
 * Scales a raw token amount by a Token-2022 ScaledUiAmount multiplier.
 *
 * Every xStock carries that extension, and none of the multipliers is 1 —
 * measured on mainnet 12 Sept 2026: AAPLx 1.00266, MSFTx 1.00458, NVDAx
 * 1.00092, SPYx 1.00391, and each has a higher one already scheduled. It is
 * how the issuer applies corporate actions without moving anyone's tokens.
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
  const value = typeof raw === "string" ? BigInt(raw) : raw;
  return (Number(value) / 10 ** decimals) * multiplier;
}

/** Formats a scaled amount the way the interface shows it. */
export function formatScaled(
  raw: bigint | string,
  decimals: number,
  multiplier: number,
  maximumFractionDigits = 6
): string {
  return scaledUiAmount(raw, decimals, multiplier).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });
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
