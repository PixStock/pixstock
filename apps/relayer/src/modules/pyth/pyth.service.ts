import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ASSETS } from '@pixstock/shared';
import { parsePayload, parseSolanaMessage, type FeedUpdate } from '@pixstock/pyth-verify';
import * as WsModule from 'ws';

/**
 * The WebSocket class, whichever shape `ws` arrives in.
 *
 * This has broken in production twice, in opposite directions, so it is
 * resolved once here rather than trusted:
 *
 *   ws 7 is CommonJS and assigns the class to `module.exports` — no named
 *   export at all. ws 8 adds `.WebSocket`. Under tsc's CommonJS output a
 *   namespace import is the module object itself; under the ES-module output
 *   the test runner uses, it is a namespace whose `default` holds it.
 *
 * Four combinations, one expression. The workspace pins ^8 and also hoists a
 * 7.5.13 for @solana/web3.js, and which one a given directory resolves is not
 * something this file should have an opinion about.
 */
const WebSocketImpl = ((WsModule as { WebSocket?: unknown }).WebSocket ??
  (WsModule as { default?: unknown }).default ??
  WsModule) as typeof WsModule.WebSocket;

/**
 * An open socket, as `ws` types it.
 *
 * Named explicitly because the bare name resolves to the DOM's WebSocket in
 * this tsconfig, which has no `.on` and would make every handler below an
 * error.
 */
type WsSocket = InstanceType<typeof WsModule.WebSocket>;

/**
 * `readyState` when the socket is open.
 *
 * The number is from the WebSocket standard, not from `ws`: reading it off
 * the class is what broke in production, because which `ws` a monorepo
 * actually resolves is not something this file should depend on.
 */
const SOCKET_OPEN = 1;

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
  /** What those feeds say, decoded once here rather than on every read. */
  feeds: FeedUpdate[];
  /** When Pyth signed it, unix seconds. */
  signedAt: number;
  /** When this process received it. */
  receivedAt: number;
}

/**
 * A price for the screen, from the same message the vault will verify.
 *
 * Served for display only. The web app cannot prove any of this — that is the
 * phone's job, on the bytes themselves — so the figures here exist to let
 * someone see a quote in context, never to be trusted.
 */
export interface DisplayPrice {
  symbol: string;
  /** `price * 10 ** expo`, already applied. */
  price: number;
  /** Pyth's own uncertainty, same units. */
  confidence: number | null;
  expo: number;
  publisherCount: number | null;
  feedId: number;
  /** Which of the asset's two feeds answered, or that neither did. */
  session: 'regular' | 'ext' | 'closed';
  /** Unix seconds, from the signed payload. */
  publishTime: number;
  /** Why there is no price, when there is none. */
  unavailable?: string;
}

/** A price older than this is not worth attaching; the vault would refuse it. */
const MAX_ATTESTATION_AGE_SECONDS = 90;
const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

@Injectable()
export class PythService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PythService.name);
  private socket: WsSocket | null = null;
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

  /**
   * Whether the price stream can be constructed at all.
   *
   * Exposed for the test that asserts it: `ws` has resolved to a version
   * without the named export twice now, and the symptom was the whole relayer
   * failing to boot.
   */
  static get socketConstructorAvailable(): boolean {
    return typeof WebSocketImpl === 'function';
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

  /**
   * The current price of each asset asked for, for display.
   *
   * An asset with no price gets a row saying why rather than being dropped:
   * "we could not price this" and "you did not ask about it" are different
   * answers, and a screen that silently omits one shows a catalogue with
   * holes in it.
   */
  prices(symbols?: readonly string[]): DisplayPrice[] {
    const wanted = symbols?.length
      ? ASSETS.filter((asset) => symbols.includes(asset.symbol))
      : ASSETS;
    const attestation = this.attestation();

    return wanted.map((asset) => {
      const regular = attestation?.feeds.find((feed) => feed.feedId === asset.pythFeedId);
      const ext =
        asset.pythExtFeedId === null
          ? undefined
          : attestation?.feeds.find((feed) => feed.feedId === asset.pythExtFeedId);
      const feed = regular ?? ext;

      if (!feed || feed.price === undefined || feed.exponent === undefined) {
        return {
          symbol: asset.symbol,
          price: 0,
          confidence: null,
          expo: 0,
          publisherCount: null,
          feedId: asset.pythFeedId,
          session: 'closed' as const,
          publishTime: 0,
          unavailable:
            this.refused.get(asset.pythFeedId) ??
            (attestation ? 'not in the current message' : 'no price stream'),
        };
      }

      const scale = 10 ** feed.exponent;
      return {
        symbol: asset.symbol,
        price: Number(feed.price) * scale,
        confidence: feed.confidence === undefined ? null : Number(feed.confidence) * scale,
        expo: feed.exponent,
        publisherCount: feed.publisherCount ?? null,
        feedId: feed.feedId,
        session: feed === regular ? ('regular' as const) : ('ext' as const),
        publishTime: attestation!.signedAt,
      };
    });
  }

  /** What /healthz says about the price stream. */
  status() {
    const attestation = this.attestation();
    return {
      connected: this.socket?.readyState === SOCKET_OPEN,
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

    let socket: WsSocket;
    try {
      socket = new WebSocketImpl(url, { headers: { Authorization: `Bearer ${this.token}` } });
    } catch (err) {
      // A price stream that cannot start is a degraded relayer, not a dead
      // one: orders still build, they simply travel unattested and the vault
      // says so. Taking the whole service down over it would be a worse
      // failure than the one being reported.
      this.logger.error(`Could not open the price stream: ${(err as Error).message}`);
      this.scheduleReconnect();
      return;
    }
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
          // Not 'real_time'. Only 33 of Pyth's ~3,700 symbols publish on that
          // channel and no xStock is among them, so asking for it is refused
          // outright: "Feeds do not support channel real_time". The feeds
          // themselves allow 200ms; the grant is what caps it at 1000ms
          // ("Channel fixed_rate@200ms violates rate limit"). One second is
          // far inside what a price check needs — the freshness rule is
          // MAX_AGE_SECONDS, not milliseconds.
          channel: 'fixed_rate@1000ms',
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
      const priced = payload.feeds.filter((feed) => feed.price !== undefined);
      this.latest = {
        bytes,
        feeds: priced,
        feedIds: priced.map((feed) => feed.feedId),
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
