/**
 * The relayer, as the web app sees it.
 *
 * Every amount is a string because it is a u64 — a number would round a
 * balance somewhere past nine digits, silently and only sometimes.
 */

import type { MintFacts } from "@pixstock/shared";

export const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL ?? "http://localhost:4000";

export interface Asset {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  tokenProgram: string;
  pythFeedId: number;
  pythExtFeedId: number | null;
}

export interface Quote {
  in: { mint: string; symbol: string; amount: string };
  out: { mint: string; symbol: string; amount: string };
  minOutAmount: string;
  slippageBps: number;
  priceImpactPct: string;
  route: string[];
}

export interface OrderLeg {
  inMint: string;
  outMint: string;
  inAmount: string;
  expectedOutAmount: string;
  minOutAmount: string;
  symbol: string;
  decimals: number;
  route: string[];
}

export interface Order {
  orderId: string;
  status:
    | "BUILT"
    | "AWAITING_SIGNATURE"
    | "SIGNED"
    | "BROADCAST"
    | "CONFIRMED"
    | "FAILED"
    | "EXPIRED";
  vault: string;
  kind: "BUY" | "SELL" | "BASKET";
  txMessages: string[];
  manifest: {
    kind: "BUY" | "SELL" | "BASKET";
    legs: OrderLeg[];
    slippageBps: number;
    feePayer: string;
    dapp: string;
    quotedAt: number;
    /**
     * Mint state read by the relayer and carried to the vault, which has no
     * network of its own. Passed through untouched — the web app is not a
     * party to it and must not edit it.
     */
    mints?: MintFacts[];
  };
  txSignatures: string[];
  /**
   * One explorer link per signature, built by the relayer.
   *
   * The cluster an order was built against is the relayer's fact, not the
   * browser's, and a link to the wrong explorer says the transaction does not
   * exist.
   */
  explorerUrls: string[];
  error: string | null;
  createdAt: string;
  sizes?: number[];
  expiry?: string;
  pending?: string[];
}

/** What the relayer says it cannot do. Shown rather than hidden. */
export interface Health {
  status: "ok" | "degraded";
  cluster: string;
  database: "up" | "down";
  relayerKey: "set" | "missing";
  relayerPublicKey: string | null;
  missing: string[];
}

export class RelayerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly violations?: Array<{ rule: string; detail: string }>,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${RELAYER_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    // A relayer that is not running is the most common failure by far, and
    // "Failed to fetch" tells nobody anything.
    throw new RelayerError(`The relayer at ${RELAYER_URL} is not answering.`, 0);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (body as { message?: string | string[] }).message;
    throw new RelayerError(
      Array.isArray(detail) ? detail.join(", ") : (detail ?? `Request failed (${response.status})`),
      response.status,
      (body as { violations?: Array<{ rule: string; detail: string }> }).violations,
    );
  }
  return body as T;
}

export const api = {
  health: () => call<Health>("/healthz"),

  assets: () => call<{ quoteMint: string; quoteDecimals: number; assets: Asset[] }>("/v1/assets"),

  quote: (params: { in: string; out: string; amount: string; slippageBps?: number }) =>
    call<Quote>(
      `/v1/quotes?${new URLSearchParams({
        in: params.in,
        out: params.out,
        amount: params.amount,
        ...(params.slippageBps ? { slippageBps: String(params.slippageBps) } : {}),
      })}`,
    ),

  createOrder: (body: {
    vault: string;
    legs: Array<{ inMint: string; outMint: string; inAmount: string }>;
    slippageBps?: number;
  }) => call<Order>("/v1/orders", { method: "POST", body: JSON.stringify(body) }),

  order: (id: string) => call<Order>(`/v1/orders/${id}`),

  submitSignature: (id: string, signatures: string[]) =>
    call<Order>(`/v1/orders/${id}/signature`, {
      method: "POST",
      body: JSON.stringify({ signatures }),
    }),
};
