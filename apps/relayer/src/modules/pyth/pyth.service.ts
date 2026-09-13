import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ASSETS } from '@pixstock/shared';
import { parsePayload, parseSolanaMessage } from '@pixstock/pyth-verify';
import WebSocket from 'ws';

/**
 * Keeps the latest price Pyth signed, ready to travel with an order.
 *
 * The relayer cannot vouch for a price — that is the point. All it does is
 * carry bytes it cannot forge from Pyth to a phone with no network, and the
 * phone decides whether to believe them. So this service is deliberately
 * dumb: subscribe, hold the most recent signed message, hand it over.
 *
 * The signed `solana` payload is served by the router endpoints only. The
 * SDK's default "api service" stream does not carry it, which is the single
 * fact that decides this file's existence.
 */
export interface Attestation {
  /** The `solana` format message, exactly as Pyth signed it. */
  bytes: Uint8Array;
  /** Feed ids it actually carries a price for. */
  feedIds: number[];
  /** When Pyth signed it, unix seconds. */
  signedAt: number;
  /** When this process received it. */
  receivedAt: number;
}

/** A price older than this is not worth attaching; the vault would refuse it. */
const MAX_ATTESTATION_AGE_SECONDS = 90;
const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

@Injectable()
export class PythService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PythService.name);
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = RECONNECT_DELAY_MS;
  private stopped = false;

  private latest: Attestation | null = null;
  /** Feeds the router refused, with the reason it gave. Reported by /healthz. */
  private readonly refused = new Map<number, string>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!this.token) {
      this.logger.warn(
        'PYTH_PRO_TOKEN is not set: orders will travel with no price attestation, and a ' +
          'vault in strict mode will refuse to sign them.',
      );
      return;
    }
    if (this.routers.length === 0) {
      this.logger.warn('PYTH_ROUTER_URLS is not set: no price attestation will be attached.');
      return;
    }
    this.connect();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  private get token(): string {
    return this.config.get<string>('relayer.pythProToken') ?? '';
  }

  private get routers(): string[] {
    return (this.config.get<string[]>('relayer.pythRouterUrls') ?? []).filter(Boolean);
  }

  /** Every feed the product prices, regular session and extended hours. */
  private get wantedFeeds(): number[] {
    return [
      ...new Set(
        ASSETS.flatMap((asset) => [asset.pythFeedId, asset.pythExtFeedId]).filter(
          (id): id is number => id !== null,
        ),
      ),
    ];
  }

  /**
   * The price to attach to an order, or null.
   *
   * Null is a normal answer — no token, no connection yet, or a price that
   * has gone stale while the stream was down. An order with no attestation
   * says so on the vault's screen; an order with a stale one would be
   * refused there anyway, and refused for a reason that sounds like a bug.
   */
  attestation(): Attestation | null {
    if (!this.latest) return null;
    const age = Math.floor(Date.now() / 1000) - this.latest.signedAt;
    if (age > MAX_ATTESTATION_AGE_SECONDS) return null;
    return this.latest;
  }

  /** What /healthz says about the price stream. */
  status() {
    const attestation = this.attestation();
    return {
      connected: this.socket?.readyState === WebSocket.OPEN,
      feeds: attestation?.feedIds ?? [],
      ageSeconds: attestation ? Math.floor(Date.now() / 1000) - attestation.signedAt : null,
      refused: Object.fromEntries(this.refused),
    };
  }

  private connect(feeds = this.wantedFeeds, routerIndex = 0): void {
    if (this.stopped) return;

    const url = this.routers[routerIndex % this.routers.length]!;
    if (feeds.length === 0) {
      this.logger.error('Every feed was refused by the router; nothing left to subscribe to.');
      return;
    }

    const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${this.token}` } });
    this.socket = socket;

    socket.on('open', () => {
      this.reconnectDelay = RECONNECT_DELAY_MS;
      this.logger.log(`Subscribed to ${url} for feeds ${feeds.join(', ')}`);
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          subscriptionId: 1,
          priceFeedIds: feeds,
          properties: ['price', 'exponent', 'confidence', 'publisherCount'],
          formats: ['solana'],
          deliveryFormat: 'json',
          jsonBinaryEncoding: 'hex',
          channel: 'real_time',
        }),
      );
    });

    socket.on('message', (raw: Buffer) => this.onMessage(raw.toString(), feeds, routerIndex));

    socket.on('error', (err: Error) => {
      this.logger.warn(`${url}: ${err.message}`);
    });

    socket.on('close', (code: number) => {
      if (this.stopped) return;
      this.logger.warn(`${url} closed (${code}); reconnecting in ${this.reconnectDelay / 1000}s`);
      this.scheduleReconnect(feeds, routerIndex + 1);
    });
  }

  private onMessage(text: string, feeds: number[], routerIndex: number): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }

    if (message['type'] === 'subscriptionError' || message['error']) {
      const reason = String(message['error'] ?? text);
      const surviving = this.dropRefusedFeeds(feeds, reason);

      if (surviving.length < feeds.length && surviving.length > 0) {
        // The router refuses the whole subscription if any one feed is
        // unavailable, so the unavailable ones are dropped and the rest are
        // asked for again. A grant that does not cover an asset is a fact
        // about the account, not a failure to retry into.
        this.logger.warn(
          `Router refused ${feeds.length - surviving.length} feed(s); retrying with ` +
            `${surviving.join(', ')}. Reason: ${reason}`,
        );
        this.socket?.close();
        this.scheduleReconnect(surviving, routerIndex, 0);
      } else {
        this.logger.error(`Router refused the subscription: ${reason}`);
      }
      return;
    }

    const hex = this.solanaHexOf(message);
    if (!hex) return;

    try {
      const bytes = Uint8Array.from(Buffer.from(hex, 'hex'));
      // Parsed here so a malformed message is caught at the source rather
      // than on a phone that cannot report it.
      const payload = parsePayload(parseSolanaMessage(bytes).payload);
      this.latest = {
        bytes,
        feedIds: payload.feeds.filter((feed) => feed.price !== undefined).map((feed) => feed.feedId),
        signedAt: Number(payload.timestampUs / 1_000_000n),
        receivedAt: Math.floor(Date.now() / 1000),
      };
    } catch (err) {
      this.logger.warn(`Unreadable price message from the router: ${(err as Error).message}`);
    }
  }

  /** The hex `solana` payload, wherever this router version puts it. */
  private solanaHexOf(message: Record<string, unknown>): string | null {
    const direct = (message['solana'] as { data?: unknown } | undefined)?.data;
    if (typeof direct === 'string' && direct.length > 0) return direct;

    const parsed = (message['parsed'] as { solana?: { data?: unknown } } | undefined)?.solana?.data;
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : null;
  }

  /** Removes the feeds the router named in its refusal, remembering why. */
  private dropRefusedFeeds(feeds: number[], reason: string): number[] {
    const named = new Set<number>();
    for (const match of reason.matchAll(/feed\s+(\d+)|(\d+)\s*\((?:inactive|unavailable)/g)) {
      const id = Number(match[1] ?? match[2]);
      if (Number.isFinite(id)) {
        named.add(id);
        this.refused.set(id, reason.includes('entitled') ? 'not entitled' : 'inactive');
      }
    }
    return feeds.filter((feed) => !named.has(feed));
  }

  private scheduleReconnect(feeds: number[], routerIndex: number, delay?: number): void {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const wait = delay ?? this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = setTimeout(() => this.connect(feeds, routerIndex), wait);
  }
}
