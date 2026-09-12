import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { symbolOfMint } from '@pixstock/shared';

export interface QuoteRequest {
  inputMint: string;
  outputMint: string;
  /** Raw amount of `inputMint`. */
  amount: string;
  slippageBps: number;
  /** Direct routes keep the transaction small enough for a multi-leg basket. */
  onlyDirectRoutes?: boolean;
}

export interface Quote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  /** Floor after slippage. The vault checks the swap cannot fill below it. */
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  route: string[];
  /** Opaque; handed straight back to Jupiter when building the transaction. */
  raw: unknown;
}

interface CacheEntry {
  quote: Quote;
  expiresAt: number;
}

/** Quotes move constantly; ten seconds keeps a basket's legs consistent. */
const CACHE_TTL_MS = 10_000;

@Injectable()
export class JupiterService {
  private readonly logger = new Logger(JupiterService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('relayer.jupiterApiUrl')!;
  }

  private get headers(): Record<string, string> {
    const key = this.config.get<string>('relayer.jupiterApiKey');
    return key ? { 'x-api-key': key } : {};
  }

  async quote(request: QuoteRequest): Promise<Quote> {
    const key = [
      request.inputMint,
      request.outputMint,
      request.amount,
      request.slippageBps,
      request.onlyDirectRoutes ?? false,
    ].join(':');

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.quote;

    const url = new URL(`${this.baseUrl}/quote`);
    url.search = new URLSearchParams({
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amount,
      slippageBps: String(request.slippageBps),
      ...(request.onlyDirectRoutes ? { onlyDirectRoutes: 'true' } : {}),
    }).toString();

    let body: Record<string, unknown>;
    try {
      const response = await fetch(url, { headers: this.headers });
      body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(`Jupiter responded ${response.status}: ${JSON.stringify(body).slice(0, 200)}`);
      }
    } catch (err) {
      this.logger.warn(`Quote failed for ${key}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('No route available right now');
    }

    if (typeof body.outAmount !== 'string') {
      throw new ServiceUnavailableException('No route available right now');
    }

    const quote = toQuote(body);
    this.cache.set(key, { quote, expiresAt: Date.now() + CACHE_TTL_MS });
    return quote;
  }

  /** Drops expired entries. Called by the controller; the map stays small. */
  sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
  }
}

export function toQuote(body: Record<string, unknown>): Quote {
  const routePlan = Array.isArray(body.routePlan) ? body.routePlan : [];

  return {
    inputMint: String(body.inputMint),
    outputMint: String(body.outputMint),
    inAmount: String(body.inAmount),
    outAmount: String(body.outAmount),
    otherAmountThreshold: String(body.otherAmountThreshold),
    slippageBps: Number(body.slippageBps),
    priceImpactPct: String(body.priceImpactPct ?? '0'),
    route: routePlan.map((step: { swapInfo?: { label?: string } }) => step.swapInfo?.label ?? 'unknown'),
    raw: body,
  };
}


