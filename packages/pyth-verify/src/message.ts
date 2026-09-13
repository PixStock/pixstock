/**
 * The wire format of a Pyth Pro price message, parsed by hand.
 *
 * Two envelopes, one inside the other. The outer one — Pyth calls it the
 * `solana` format — carries the Ed25519 signature and the key that made it.
 * The inner one is the payload that was actually signed: a timestamp, a
 * channel, and a list of feeds each carrying a list of properties.
 *
 * Both layouts are little-endian, and both are taken from the published
 * protocol crate (`pyth-lazer-protocol`, `message.rs` and `payload.rs`).
 *
 * Parsing is strict on purpose. Every length is checked before it is read,
 * trailing bytes are an error, and an unknown property id is fatal rather
 * than skipped: property values are not length-prefixed, so a parser that
 * guesses at an unknown one is a parser that can be walked off its own
 * offsets by whoever wrote the bytes.
 */

/** `solana` format envelope: u32 LE magic. */
export const SOLANA_FORMAT_MAGIC = 2_182_742_457;
/** Payload magic, inside the signature. */
export const PAYLOAD_FORMAT_MAGIC = 2_479_346_549;

export class MalformedMessage extends Error {
  constructor(message: string) {
    super(`pyth-verify: ${message}`);
    this.name = "MalformedMessage";
  }
}

/** One property of one feed. Only the ones a price check needs are named. */
export interface FeedUpdate {
  feedId: number;
  /** Mantissa; the real price is `price * 10 ** exponent`. Absent when Pyth sent none. */
  price?: bigint;
  bestBidPrice?: bigint;
  bestAskPrice?: bigint;
  confidence?: bigint;
  exponent?: number;
  publisherCount?: number;
}

export interface PayloadData {
  /** Microseconds since the epoch, as Pyth sends it. */
  timestampUs: bigint;
  channelId: number;
  feeds: FeedUpdate[];
}

export interface SolanaMessage {
  signature: Uint8Array;
  publicKey: Uint8Array;
  /** The exact bytes the signature covers. */
  payload: Uint8Array;
}

/** Property ids, from the protocol's `PriceFeedProperty` enum. */
const PROPERTY = {
  price: 0,
  bestBidPrice: 1,
  bestAskPrice: 2,
  publisherCount: 3,
  exponent: 4,
  confidence: 5,
  fundingRate: 6,
  fundingTimestamp: 7,
  fundingRateInterval: 8,
  marketSession: 9,
  emaPrice: 10,
  emaConfidence: 11,
  feedUpdateTimestamp: 12,
} as const;

/** A cursor that refuses to read past the end of its buffer. */
class Reader {
  private offset = 0;

  constructor(private readonly view: DataView) {}

  private take(length: number): number {
    const at = this.offset;
    if (at + length > this.view.byteLength) {
      throw new MalformedMessage(
        `the message ends mid-field: ${length} bytes wanted at offset ${at}, ` +
          `${this.view.byteLength - at} left`,
      );
    }
    this.offset += length;
    return at;
  }

  u8(): number {
    return this.view.getUint8(this.take(1));
  }
  u16(): number {
    return this.view.getUint16(this.take(2), true);
  }
  i16(): number {
    return this.view.getInt16(this.take(2), true);
  }
  u32(): number {
    return this.view.getUint32(this.take(4), true);
  }
  u64(): bigint {
    return this.view.getBigUint64(this.take(8), true);
  }
  i64(): bigint {
    return this.view.getBigInt64(this.take(8), true);
  }
  bytes(length: number): Uint8Array {
    const at = this.take(length);
    return new Uint8Array(this.view.buffer, this.view.byteOffset + at, length);
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }
}

const viewOf = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * Splits the outer envelope: signature, signer, and the bytes it signed.
 *
 * Nothing here is trusted yet — this only says the bytes have the shape of a
 * Pyth message. `verifyMessage` decides whether to believe it.
 */
export function parseSolanaMessage(bytes: Uint8Array): SolanaMessage {
  const reader = new Reader(viewOf(bytes));

  const magic = reader.u32();
  if (magic !== SOLANA_FORMAT_MAGIC) {
    throw new MalformedMessage(
      `not a Pyth solana-format message: magic ${magic}, expected ${SOLANA_FORMAT_MAGIC}`,
    );
  }

  const signature = reader.bytes(64);
  const publicKey = reader.bytes(32);
  const length = reader.u16();
  const payload = reader.bytes(length);

  if (reader.remaining !== 0) {
    // Trailing bytes are never harmless: they are bytes outside the
    // signature, and accepting them invites a message that reads one way here
    // and another way to whoever wrote it.
    throw new MalformedMessage(`${reader.remaining} bytes trail the message`);
  }

  return { signature, publicKey, payload };
}

/** Reads the signed payload: when it was made, and what it says each feed costs. */
export function parsePayload(bytes: Uint8Array): PayloadData {
  const reader = new Reader(viewOf(bytes));

  const magic = reader.u32();
  if (magic !== PAYLOAD_FORMAT_MAGIC) {
    throw new MalformedMessage(
      `not a Pyth payload: magic ${magic}, expected ${PAYLOAD_FORMAT_MAGIC}`,
    );
  }

  const timestampUs = reader.u64();
  const channelId = reader.u8();
  const feedCount = reader.u8();

  const feeds: FeedUpdate[] = [];
  for (let i = 0; i < feedCount; i++) {
    const feedId = reader.u32();
    const propertyCount = reader.u8();
    const feed: FeedUpdate = { feedId };

    for (let p = 0; p < propertyCount; p++) {
      const property = reader.u8();
      switch (property) {
        // Price-shaped values: an i64 mantissa, where zero means "none".
        case PROPERTY.price:
          feed.price = nonZero(reader.i64());
          break;
        case PROPERTY.bestBidPrice:
          feed.bestBidPrice = nonZero(reader.i64());
          break;
        case PROPERTY.bestAskPrice:
          feed.bestAskPrice = nonZero(reader.i64());
          break;
        case PROPERTY.confidence:
          feed.confidence = nonZero(reader.i64());
          break;
        case PROPERTY.emaPrice:
        case PROPERTY.emaConfidence:
          reader.i64();
          break;
        case PROPERTY.publisherCount:
          feed.publisherCount = reader.u16();
          break;
        case PROPERTY.exponent:
          feed.exponent = reader.i16();
          break;
        case PROPERTY.marketSession:
          reader.i16();
          break;
        // Optional values: a presence byte, then the value itself.
        case PROPERTY.fundingRate:
          if (reader.u8() !== 0) reader.i64();
          break;
        case PROPERTY.fundingTimestamp:
        case PROPERTY.fundingRateInterval:
        case PROPERTY.feedUpdateTimestamp:
          if (reader.u8() !== 0) reader.u64();
          break;
        default:
          throw new MalformedMessage(
            `unknown property ${property} on feed ${feedId}: its length is not known, ` +
              "so the rest of this message cannot be read safely",
          );
      }
    }

    feeds.push(feed);
  }

  if (reader.remaining !== 0) {
    throw new MalformedMessage(`${reader.remaining} bytes trail the payload`);
  }

  return { timestampUs, channelId, feeds };
}

const nonZero = (value: bigint): bigint | undefined => (value === 0n ? undefined : value);
