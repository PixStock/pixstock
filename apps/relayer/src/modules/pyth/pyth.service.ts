import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ASSETS } from '@pixstock/shared';
import { parsePayload, parseSolanaMessage } from '@pixstock/pyth-verify';
// Named, not default: `ws` is CommonJS and assigns `module.exports`, so the
// default import compiles to `undefined` under this tsconfig's interop.
import { WebSocket } from 'ws';

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
  /**
   * The feeds currently asked for.
   *
   * Instance state rather than a closure argument: a refusal closes the
   * socket, and the close handler must reconnect with the narrowed list. When
   * that list lived in the closure the two paths disagreed, and the service
   * resubscribed to the refused feeds forever.
   */
  private feeds: number[] = [];
  private routerIndex = 0;
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
    this.feeds = this.wantedFeeds;
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

  private connect(): void {
    if (this.stopped) return;

    if (this.feeds.length === 0) {
      this.logger.error('Every feed was refused by the router; nothing left to subscribe to.');
      return;
    }

    const feeds = this.feeds;
    const url = this.routers[this.routerIndex % this.routers.length]!;

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

    socket.on('message', (raw: Buffer) => this.onMessage(raw.toString()));

    socket.on('error', (err: Error) => {
      this.logger.warn(`${url}: ${err.message}`);
    });

    socket.on('close', (code: number) => {
      if (this.stopped || socket !== this.socket) return;
      this.routerIndex += 1;
      this.logger.warn(`${url} closed (${code}); reconnecting in ${this.reconnectDelay / 1000}s`);
      this.scheduleReconnect();
    });
  }

  private onMessage(text: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }

    if (message['type'] === 'subscriptionError' || message['error']) {
      const reason = String(message['error'] ?? text);
      const before = this.feeds.length;
      // The router refuses the whole subscription if any one feed is
      // unavailable, so the unavailable ones are dropped and the rest asked
      // for again. A grant that does not cover an asset is a fact about the
      // account, not a failure to retry into.
      this.feeds = this.dropRefusedFeeds(this.feeds, reason);

      if (this.feeds.length < before && this.feeds.length > 0) {
        this.logger.warn(
          `Router refused ${before - this.feeds.length} feed(s); retrying with ` +
            `${this.feeds.join(', ')}. Reason: ${reason}`,
        );
      } else {
        this.logger.error(`Router refused the subscription: ${reason}`);
      }

      // The close handler reconnects, with whatever is left.
      this.socket?.close();
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

  /**
   * Removes the feeds the router named in its refusal, remembering why.
   *
   * The two reasons are not the same problem and must not be reported as one:
   * a feed outside the grant needs an account change, while an inactive one
   * is a closed session and comes back on its own. The router states them in
   * separate clauses of the same sentence, so each clause is read for the
   * ids it names.
   */
  private dropRefusedFeeds(feeds: number[], reason: string): number[] {
    const named = new Set<number>();

    const entitledAt = reason.indexOf('Not entitled');
    const unstable = entitledAt >= 0 ? reason.slice(0, entitledAt) : reason;
    const unentitled = entitledAt >= 0 ? reason.slice(entitledAt) : '';

    const collect = (clause: string, why: string) => {
      for (const match of clause.matchAll(/(\d{2,})/g)) {
        const id = Number(match[1]);
        if (feeds.includes(id)) {
          named.add(id);
          this.refused.set(id, why);
        }
      }
    };

    collect(unstable, 'inactive');
    collect(unentitled, 'not entitled');

    return feeds.filter((feed) => !named.has(feed));
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const wait = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = setTimeout(() => this.connect(), wait);
  }
}
