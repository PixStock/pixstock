import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSETS, USDC_MINT } from "@pixstock/shared";
import {
  MAX_AGE_SECONDS,
  TRUSTED_SIGNERS,
  checkAttestation,
  oraclePrice,
  parsePayload,
  parseSolanaMessage,
  permitsSigning,
  verify,
  type PricedLine,
} from "../src/index.js";

/**
 * A price Pyth actually signed, verified with the keys Pyth actually
 * publishes — offline, the way a phone in airplane mode does it.
 *
 * Everything else in this suite proves the verifier behaves correctly on
 * bytes we produced. This is the one that proves we read Pyth's bytes
 * correctly, which no amount of self-consistency can establish. Recapture it
 * with:
 *
 *   node scripts/capture-pyth-attestation.mjs 1847 > packages/pyth-verify/test/attestation.json
 *
 * `now` is pinned to the capture: a recorded message is old by definition,
 * and the freshness rule is tested on its own terms elsewhere.
 */
const recorded = JSON.parse(
  readFileSync(new URL("./attestation.json", import.meta.url), "utf8"),
) as { capturedAt: string; router: string; feedIds: number[]; solanaHex: string };

const MESSAGE = Uint8Array.from(Buffer.from(recorded.solanaHex, "hex"));
const CAPTURED_AT = Math.floor(new Date(recorded.capturedAt).getTime() / 1000);
const TSLA = ASSETS.find((asset) => asset.symbol === "TSLAx")!;

describe("a price Pyth really signed", () => {
  it("is the size the optical channel was dimensioned for", () => {
    // 145 bytes: magic, signature, signer, length, and a one-feed payload.
    // The frame budget in docs/AGQP-SPEC.md is built on this number.
    expect(MESSAGE.length).toBe(145);
  });

  it("verifies against the signers published on chain", () => {
    const result = verify(MESSAGE, { now: CAPTURED_AT });

    expect(
      result.ok,
      result.ok ? "" : `${result.reason}: ${result.detail}`,
    ).toBe(true);
    if (!result.ok) return;

    expect(TRUSTED_SIGNERS.map((signer) => signer.address)).toContain(result.signer.address);
    expect(result.ageSeconds).toBeLessThanOrEqual(MAX_AGE_SECONDS);
  });

  it("carries a Tesla price a human would recognise", () => {
    const payload = parsePayload(parseSolanaMessage(MESSAGE).payload);
    const feed = payload.feeds.find((f) => f.feedId === TSLA.pythFeedId);

    expect(
      feed,
      `no feed ${TSLA.pythFeedId} among ${payload.feeds.map((f) => f.feedId).join(", ")}`,
    ).toBeDefined();
    expect(feed!.price).toBeDefined();
    expect(feed!.exponent).toBe(-8);

    const price = oraclePrice(feed!.price!, feed!.exponent!);
    // Not an assertion about Tesla's valuation — an assertion that the
    // mantissa and the exponent were read the right way round. Off by one
    // decimal place and this fails.
    expect(price).toBeGreaterThan(10);
    expect(price).toBeLessThan(10_000);
  });

  it("refuses the same message with the price edited", () => {
    // The attack, done to real bytes: change what the price says and leave
    // everything else — including Pyth's signature — untouched.
    //
    // The envelope is 4 + 64 + 32 + 2 = 102 bytes, and the price mantissa
    // sits 20 bytes into the payload (magic, timestamp, channel, feed count,
    // feed id, property count, property id).
    const PRICE_AT = 102 + 20;
    const tampered = Uint8Array.from(MESSAGE);
    tampered[PRICE_AT] ^= 0x08;

    const before = parsePayload(parseSolanaMessage(MESSAGE).payload).feeds[0]!.price;
    const after = parsePayload(parseSolanaMessage(tampered).payload).feeds[0]!.price;
    expect(after, "the tampered byte should change the price").not.toBe(before);

    const result = verify(tampered, { now: CAPTURED_AT });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("bad-signature");
  });

  it("refuses it if the signature is touched", () => {
    const tampered = Uint8Array.from(MESSAGE);
    tampered[10] ^= 0x01;

    const result = verify(tampered, { now: CAPTURED_AT });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("bad-signature");
  });

  it("refuses it once it has gone stale", () => {
    const result = verify(MESSAGE, { now: CAPTURED_AT + MAX_AGE_SECONDS + 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("stale");
  });

  it("prices a real order against it, end to end", () => {
    const payload = parsePayload(parseSolanaMessage(MESSAGE).payload);
    const feed = payload.feeds.find((f) => f.feedId === TSLA.pythFeedId)!;
    const price = oraclePrice(feed.price!, feed.exponent!);

    // 500 USDC at exactly the oracle's price, and the same order with 3% more
    // shares than the market would hand over.
    const order = (deviation: number): PricedLine[] => [
      { mint: USDC_MINT, rawAmount: "500000000", direction: "in" },
      {
        mint: TSLA.mint,
        rawAmount: String(Math.round((500 / (price * (1 + deviation))) * 10 ** TSLA.decimals)),
        direction: "out",
      },
    ];

    const honest = checkAttestation({ price: MESSAGE, lines: order(0), now: CAPTURED_AT });
    expect(honest.state).toBe("verified");
    expect(permitsSigning(honest, true)).toBe(true);

    const inflated = checkAttestation({ price: MESSAGE, lines: order(-0.03), now: CAPTURED_AT });
    expect(inflated.state).toBe("verified");
    expect(permitsSigning(inflated, true)).toBe(false);
  });
});
