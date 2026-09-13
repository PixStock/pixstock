import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import {
  MAX_AGE_SECONDS,
  TRUSTED_SIGNERS,
  parsePayload,
  parseSolanaMessage,
  verify,
  type TrustedSigner,
} from "../src/index.js";
import { encodePayload, encodeSolanaMessage } from "./encode.js";

/**
 * The signature check, which is the only thing standing between a holder and
 * a price the relayer made up.
 *
 * Every message here is signed for real. What varies is who signed it, what
 * they signed, and when — because those are the three ways a forged price
 * arrives.
 */
const PYTH_SEED = new Uint8Array(32).fill(7);
const IMPOSTOR_SEED = new Uint8Array(32).fill(8);

const NOW = 1_789_000_000;

/** Stands in for the real published set, so the tests do not depend on a rotation. */
const signers: TrustedSigner[] = [
  {
    publicKey: ed25519.getPublicKey(PYTH_SEED),
    address: base58.encode(ed25519.getPublicKey(PYTH_SEED)),
    expiresAt: NOW + 86_400,
  },
];

const tsla = (over: { price?: bigint; timestampUs?: bigint } = {}) =>
  encodeSolanaMessage(
    encodePayload({
      timestampUs: over.timestampUs ?? BigInt(NOW) * 1_000_000n,
      feeds: [
        {
          feedId: 1435,
          price: over.price ?? 25_000_000n, // 250.00000 at exponent -5
          exponent: -5,
          confidence: 12_000n,
          publisherCount: 9,
        },
      ],
    }),
    PYTH_SEED,
  );

describe("reading the wire format", () => {
  it("round-trips the envelope Pyth publishes", () => {
    const payload = encodePayload({
      timestampUs: 1_789_000_000_000_000n,
      feeds: [{ feedId: 1435, price: 25_000_000n, exponent: -5 }],
    });
    const message = parseSolanaMessage(encodeSolanaMessage(payload, PYTH_SEED));

    expect(message.signature).toHaveLength(64);
    expect(message.publicKey).toHaveLength(32);
    expect([...message.payload]).toEqual([...payload]);
  });

  it("reads the properties a price check needs", () => {
    const payload = parsePayload(
      encodePayload({
        timestampUs: 1_789_000_000_000_000n,
        channelId: 1,
        feeds: [
          { feedId: 1435, price: 25_000_000n, exponent: -5, confidence: 12_000n, publisherCount: 9 },
          { feedId: 922, price: 22_500_000n, exponent: -5 },
        ],
      }),
    );

    expect(payload.timestampUs).toBe(1_789_000_000_000_000n);
    expect(payload.feeds).toHaveLength(2);
    expect(payload.feeds[0]).toEqual({
      feedId: 1435,
      price: 25_000_000n,
      exponent: -5,
      confidence: 12_000n,
      publisherCount: 9,
    });
    expect(payload.feeds[1]!.price).toBe(22_500_000n);
  });

  it("steps over properties it has no use for", () => {
    // A feed carries funding rates and EMAs this product never reads. Their
    // lengths differ, so stepping over them correctly is the difference
    // between reading the next feed and reading noise.
    const payload = parsePayload(
      encodePayload({
        timestampUs: 1_789_000_000_000_000n,
        feeds: [
          {
            feedId: 1435,
            price: 25_000_000n,
            exponent: -5,
            extras: [
              { id: 10, bytes: new Uint8Array(8) }, // EmaPrice, i64
              { id: 6, bytes: Uint8Array.of(1, 0, 0, 0, 0, 0, 0, 0, 0) }, // FundingRate, present + i64
              { id: 7, bytes: Uint8Array.of(0) }, // FundingTimestamp, absent
              { id: 9, bytes: Uint8Array.of(0, 0) }, // MarketSession, i16
            ],
          },
          { feedId: 922, price: 22_500_000n, exponent: -5 },
        ],
      }),
    );

    expect(payload.feeds[1]).toEqual({ feedId: 922, price: 22_500_000n, exponent: -5 });
  });

  it("refuses a property whose length it cannot know", () => {
    // Property values are not length-prefixed. A parser that skips an unknown
    // one can be walked off its own offsets by whoever wrote the bytes, so it
    // stops instead.
    expect(() =>
      parsePayload(
        encodePayload({
          timestampUs: 1_789_000_000_000_000n,
          feeds: [{ feedId: 1435, price: 1n, extras: [{ id: 200, bytes: Uint8Array.of(1) }] }],
        }),
      ),
    ).toThrow(/unknown property 200/);
  });

  it("refuses bytes that are not a Pyth message at all", () => {
    expect(() => parseSolanaMessage(new Uint8Array(145).fill(9))).toThrow(/not a Pyth/);
  });

  it("refuses a message that ends mid-field", () => {
    const full = tsla();
    expect(() => parseSolanaMessage(full.slice(0, full.length - 4))).toThrow(/ends mid-field/);
  });

  it("refuses bytes appended after the payload", () => {
    // Bytes outside the signature are bytes nobody vouched for.
    const trailing = new Uint8Array([...tsla(), 0, 0, 0]);
    expect(() => parseSolanaMessage(trailing)).toThrow(/trail/);
  });
});

describe("who signed it", () => {
  it("accepts a current price from a trusted key", () => {
    const result = verify(tsla(), { now: NOW, signers });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.feeds[0]!.price).toBe(25_000_000n);
    expect(result.ageSeconds).toBe(0);
  });

  it("refuses a valid signature by a key Pyth never published", () => {
    // The attack this package exists for: a compromised relayer signs its own
    // price with its own key. The signature is perfectly valid — and worthless.
    const forged = encodeSolanaMessage(
      encodePayload({
        timestampUs: BigInt(NOW) * 1_000_000n,
        feeds: [{ feedId: 1435, price: 1n, exponent: -5 }],
      }),
      IMPOSTOR_SEED,
    );

    const result = verify(forged, { now: NOW, signers });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unknown-signer");
  });

  it("refuses a payload edited after signing", () => {
    const message = tsla();
    // Flip one byte of the price, deep inside the payload.
    message[message.length - 6] ^= 0x40;

    const result = verify(message, { now: NOW, signers });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("bad-signature");
  });

  it("refuses a signature lifted onto another payload", () => {
    const real = parseSolanaMessage(tsla());
    const other = encodePayload({
      timestampUs: BigInt(NOW) * 1_000_000n,
      feeds: [{ feedId: 1435, price: 1_000_000n, exponent: -5 }],
    });

    const spliced = new Uint8Array(4 + 64 + 32 + 2 + other.length);
    const view = new DataView(spliced.buffer);
    view.setUint32(0, 2_182_742_457, true);
    spliced.set(real.signature, 4);
    spliced.set(real.publicKey, 68);
    view.setUint16(100, other.length, true);
    spliced.set(other, 102);

    const result = verify(spliced, { now: NOW, signers });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("bad-signature");
  });

  it("refuses a signer whose published expiry has passed", () => {
    const expired = [{ ...signers[0]!, expiresAt: NOW - 1 }];
    const result = verify(tsla(), { now: NOW, signers: expired });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("signer-expired");
  });
});

describe("when it was signed", () => {
  it("refuses a price older than the freshness window", () => {
    const old = tsla({ timestampUs: BigInt(NOW - MAX_AGE_SECONDS - 1) * 1_000_000n });
    const result = verify(old, { now: NOW, signers });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("stale");
    expect(result.detail).toMatch(/old/);
  });

  it("accepts a price inside the window and reports its age", () => {
    const result = verify(tsla({ timestampUs: BigInt(NOW - 30) * 1_000_000n }), {
      now: NOW,
      signers,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ageSeconds).toBe(30);
  });

  it("refuses a price dated in the future, and says the clock may be wrong", () => {
    // A phone in airplane mode has no way to correct its clock, so the
    // failure has to name both possibilities.
    const result = verify(tsla({ timestampUs: BigInt(NOW + 3600) * 1_000_000n }), {
      now: NOW,
      signers,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("from-the-future");
    expect(result.detail).toMatch(/clock/);
  });
});

describe("the signers this build trusts", () => {
  it("carries at least one, with an expiry in the future", () => {
    // An empty or expired set means the vault refuses every price, which is
    // safe but useless — and it should be found here, not on a phone.
    expect(TRUSTED_SIGNERS.length).toBeGreaterThan(0);
    for (const signer of TRUSTED_SIGNERS) {
      expect(signer.publicKey).toHaveLength(32);
      expect(base58.encode(signer.publicKey)).toBe(signer.address);
      expect(signer.expiresAt * 1000).toBeGreaterThan(Date.now());
    }
  });
});
