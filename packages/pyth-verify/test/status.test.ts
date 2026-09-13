import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { ASSETS, USDC_MINT } from "@pixstock/shared";
import {
  MAX_DEVIATION,
  checkAttestation,
  permitsSigning,
  type PricedLine,
  type TrustedSigner,
} from "../src/index.js";
import { encodePayload, encodeSolanaMessage } from "./encode.js";

/**
 * What the vault says about a price, end to end: bytes in, verdict out.
 *
 * The case that matters is a relayer inflating what you receive. Every number
 * on its screen can be made to agree with every other; the one thing it
 * cannot do is produce Pyth's signature over its own price, and these tests
 * are what prove the vault notices.
 */
const PYTH_SEED = new Uint8Array(32).fill(7);
const NOW = 1_789_000_000;

const signers: TrustedSigner[] = [
  {
    publicKey: ed25519.getPublicKey(PYTH_SEED),
    address: base58.encode(ed25519.getPublicKey(PYTH_SEED)),
    expiresAt: NOW + 86_400,
  },
];

const TSLA = ASSETS.find((asset) => asset.symbol === "TSLAx")!;
const AAPL = ASSETS.find((asset) => asset.symbol === "AAPLx")!;

/** 250.00000 and 225.00000, at Pyth's exponent of -5. */
const TSLA_PRICE = 250;
const AAPL_PRICE = 225;

const attestation = (feeds = [feedFor(TSLA.pythFeedId, TSLA_PRICE)]) =>
  encodeSolanaMessage(
    encodePayload({ timestampUs: BigInt(NOW) * 1_000_000n, feeds }),
    PYTH_SEED,
  );

function feedFor(feedId: number, price: number) {
  return {
    feedId,
    price: BigInt(Math.round(price * 1e5)),
    exponent: -5,
    confidence: 12_000n,
    publisherCount: 9,
  };
}

/**
 * The two ticket lines for one leg: USDC paid, shares received.
 *
 * `deviation` is what the order claims relative to the oracle — a negative
 * value hands over more shares than the market would, which is the shape of
 * an inflated quote.
 */
function leg(
  asset: (typeof ASSETS)[number],
  oraclePrice: number,
  usdc: number,
  deviation = 0,
  multiplier?: number,
): PricedLine[] {
  const shares = usdc / (oraclePrice * (1 + deviation));
  const raw = BigInt(Math.round((shares / (multiplier ?? 1)) * 10 ** asset.decimals));
  return [
    { mint: USDC_MINT, rawAmount: String(Math.round(usdc * 1e6)), direction: "in" },
    {
      mint: asset.mint,
      rawAmount: String(raw),
      direction: "out",
      ...(multiplier !== undefined ? { multiplier } : {}),
    },
  ];
}

const check = (price: Uint8Array | undefined, lines: PricedLine[]) =>
  checkAttestation({ ...(price ? { price } : {}), lines, now: NOW, signers });

describe("what the vault may claim about a price", () => {
  it("reports an absent attestation as absent", () => {
    expect(checkAttestation({}).state).toBe("absent");
    expect(checkAttestation({ price: new Uint8Array(0) }).state).toBe("absent");
  });

  it("refuses bytes that are not a Pyth message, whatever their length", () => {
    // Anything can attach bytes. Only a signature makes them evidence.
    for (const length of [1, 64, 145, 205, 1200]) {
      const status = check(new Uint8Array(length).fill(9), leg(TSLA, TSLA_PRICE, 500));
      expect(status.state, `${length} bytes`).toBe("rejected");
    }
  });

  it("verifies an honest order and puts a number on it", () => {
    const status = check(attestation(), leg(TSLA, TSLA_PRICE, 500));

    expect(status.state).toBe("verified");
    if (status.state !== "verified") return;
    expect(Math.abs(status.deviation)).toBeLessThan(0.0001);
    expect(status.ageSeconds).toBe(0);
    expect(status.legs).toHaveLength(1);
    expect(status.legs[0]!.symbol).toBe("TSLAx");
    expect(status.legs[0]!.oracle).toBeCloseTo(TSLA_PRICE, 5);
    expect(status.legs[0]!.implied).toBeCloseTo(TSLA_PRICE, 3);
    expect(status.legs[0]!.confidence).toBeCloseTo(0.12, 5);
    expect(permitsSigning(status, true)).toBe(true);
  });

  it("refuses to sign an order whose quote is inflated by 3%", () => {
    // The acceptance criterion for feature D: a relayer that claims to hand
    // over 3% more shares than the market would.
    const status = check(attestation(), leg(TSLA, TSLA_PRICE, 500, -0.03));

    expect(status.state).toBe("verified");
    if (status.state !== "verified") return;
    expect(status.deviation).toBeLessThan(-MAX_DEVIATION);
    expect(status.label).toMatch(/off the market/);
    expect(status.legs[0]!.severity).toBe("refuse");
    expect(permitsSigning(status, true)).toBe(false);
  });

  it("refuses an order that overcharges by 3% just the same", () => {
    const status = check(attestation(), leg(TSLA, TSLA_PRICE, 500, 0.03));
    expect(status.state).toBe("verified");
    if (status.state !== "verified") return;
    expect(status.deviation).toBeGreaterThan(MAX_DEVIATION);
    expect(permitsSigning(status, true)).toBe(false);
  });

  it("warns but allows inside the warning band", () => {
    const status = check(attestation(), leg(TSLA, TSLA_PRICE, 500, 0.007));
    expect(status.state).toBe("verified");
    if (status.state !== "verified") return;
    expect(status.warn).toBe(true);
    expect(status.legs[0]!.severity).toBe("warn");
    expect(permitsSigning(status, true)).toBe(true);
  });

  it("applies the mint's multiplier before pricing anything", () => {
    // An xStock's raw balance is not its share count. Leaving the multiplier
    // out moves the implied price by however far the mint has scaled — which
    // on today's figures is half the whole tolerance.
    const honest = check(attestation(), leg(TSLA, TSLA_PRICE, 500, 0, 1.004));
    expect(honest.state).toBe("verified");
    if (honest.state !== "verified") return;
    expect(Math.abs(honest.deviation)).toBeLessThan(0.0001);
  });

  it("lets the worst leg of a basket decide", () => {
    const status = check(
      attestation([feedFor(TSLA.pythFeedId, TSLA_PRICE), feedFor(AAPL.pythFeedId, AAPL_PRICE)]),
      [...leg(TSLA, TSLA_PRICE, 300), ...leg(AAPL, AAPL_PRICE, 200, 0.04)],
    );

    expect(status.state).toBe("verified");
    if (status.state !== "verified") return;
    expect(status.legs).toHaveLength(2);
    // Averaging would hide it: +4% on two fifths of the basket averages under
    // the limit, and the holder would sign the leg that is being taken.
    expect(status.legs.find((l) => l.symbol === "AAPLx")!.severity).toBe("refuse");
    expect(permitsSigning(status, true)).toBe(false);
  });

  it("says so when the attestation carries no price for the asset", () => {
    const status = check(attestation([feedFor(AAPL.pythFeedId, AAPL_PRICE)]), leg(TSLA, TSLA_PRICE, 500));
    expect(status.state).toBe("unverifiable");
    expect(status.detail).toMatch(/TSLAx/);
  });

  it("uses the extended-hours feed when that is the one Pyth signed", () => {
    const status = check(
      attestation([feedFor(TSLA.pythExtFeedId!, TSLA_PRICE)]),
      leg(TSLA, TSLA_PRICE, 500),
    );
    expect(status.state).toBe("verified");
    if (status.state !== "verified") return;
    expect(status.legs[0]!.feedId).toBe(TSLA.pythExtFeedId);
  });
});

describe("strict mode", () => {
  it("refuses to sign anything unverified", () => {
    expect(permitsSigning(checkAttestation({}), true)).toBe(false);
    expect(permitsSigning(check(new Uint8Array(145), leg(TSLA, TSLA_PRICE, 500)), true)).toBe(false);
  });

  it("never allows a refused attestation, even unstrict", () => {
    // Strictness governs what may be signed without proof. It does not extend
    // to a proof that came back negative.
    const forged = check(new Uint8Array(145), leg(TSLA, TSLA_PRICE, 500));
    expect(forged.state).toBe("rejected");
    expect(permitsSigning(forged, false)).toBe(false);
  });

  it("allows an unattested order only when strictness is turned off", () => {
    expect(permitsSigning(checkAttestation({}), false)).toBe(true);
  });
});
