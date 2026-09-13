/**
 * Writes the Pyth wire format, so the tests can read it back.
 *
 * The parser is the thing under test, and a parser tested only against its
 * own output proves nothing — so this encoder is written from the published
 * layout in `pyth-lazer-protocol` (`message.rs`, `payload.rs`), independently
 * of `src/message.ts`, and the live suite checks both against a message Pyth
 * actually signed.
 *
 * The signatures below are real Ed25519 signatures over real bytes. What the
 * tests vary is who holds the key.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { PAYLOAD_FORMAT_MAGIC, SOLANA_FORMAT_MAGIC } from "../src/message.js";

export interface FeedInput {
  feedId: number;
  /** Price mantissa. The real price is `price * 10 ** exponent`. */
  price?: bigint;
  exponent?: number;
  confidence?: bigint;
  publisherCount?: number;
  /** Properties to append that the vault has no use for, to prove it steps over them. */
  extras?: Array<{ id: number; bytes: Uint8Array }>;
}

class Writer {
  private parts: Uint8Array[] = [];

  u8(value: number) {
    this.parts.push(Uint8Array.of(value));
    return this;
  }
  u16(value: number) {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    this.parts.push(bytes);
    return this;
  }
  i16(value: number) {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setInt16(0, value, true);
    this.parts.push(bytes);
    return this;
  }
  u32(value: number) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    this.parts.push(bytes);
    return this;
  }
  u64(value: bigint) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, value, true);
    this.parts.push(bytes);
    return this;
  }
  i64(value: bigint) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigInt64(0, value, true);
    this.parts.push(bytes);
    return this;
  }
  raw(bytes: Uint8Array) {
    this.parts.push(bytes);
    return this;
  }

  done(): Uint8Array {
    const total = this.parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}

/** Property ids, from `PriceFeedProperty`. */
const PRICE = 0;
const PUBLISHER_COUNT = 3;
const EXPONENT = 4;
const CONFIDENCE = 5;

export function encodePayload(options: {
  timestampUs: bigint;
  channelId?: number;
  feeds: FeedInput[];
}): Uint8Array {
  const writer = new Writer()
    .u32(PAYLOAD_FORMAT_MAGIC)
    .u64(options.timestampUs)
    .u8(options.channelId ?? 1)
    .u8(options.feeds.length);

  for (const feed of options.feeds) {
    const properties: Array<() => void> = [];
    if (feed.price !== undefined) {
      properties.push(() => writer.u8(PRICE).i64(feed.price!));
    }
    if (feed.exponent !== undefined) {
      properties.push(() => writer.u8(EXPONENT).i16(feed.exponent!));
    }
    if (feed.confidence !== undefined) {
      properties.push(() => writer.u8(CONFIDENCE).i64(feed.confidence!));
    }
    if (feed.publisherCount !== undefined) {
      properties.push(() => writer.u8(PUBLISHER_COUNT).u16(feed.publisherCount!));
    }
    for (const extra of feed.extras ?? []) {
      properties.push(() => writer.u8(extra.id).raw(extra.bytes));
    }

    writer.u32(feed.feedId).u8(properties.length);
    for (const write of properties) write();
  }

  return writer.done();
}

/** Wraps a payload in the `solana` envelope, signed by `seed`. */
export function encodeSolanaMessage(payload: Uint8Array, seed: Uint8Array): Uint8Array {
  const signature = ed25519.sign(payload, seed);
  const publicKey = ed25519.getPublicKey(seed);

  return new Writer()
    .u32(SOLANA_FORMAT_MAGIC)
    .raw(signature)
    .raw(publicKey)
    .u16(payload.length)
    .raw(payload)
    .done();
}
