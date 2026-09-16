import { describe, expect, it } from "vitest";
import { ASSETS, USDC_MINT } from "@pixstock/shared";
import {
  CHUNK_SIZES,
  decodePayload,
  encodeFrames,
  encodeSessionId,
  encodePayload,
  newSessionId,
  type PairRecord,
  type SignRequest,
  type SignResponse,
} from "../src/index.js";

const VAULT = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const PAYER = "7E4hLRoWyxEgyg91Circ7WwFi6LvSBLhnNgWFEjK1JcY";
const tesla = ASSETS.find((a) => a.symbol === "TSLAx")!;

const leg = (symbol: string, inAmount: string) => {
  const asset = ASSETS.find((a) => a.symbol === symbol)!;
  return {
    inMint: USDC_MINT,
    outMint: asset.mint,
    inAmount,
    expectedOutAmount: "2738296",
    minOutAmount: "2710914",
    pythFeedId: asset.pythFeedId,
  };
};

const request = (over: Partial<SignRequest> = {}): SignRequest => ({
  kind: "SIGN",
  sid: newSessionId(),
  vault: VAULT,
  txs: [new Uint8Array(452).fill(7)],
  manifest: {
    kind: "BUY",
    legs: [leg("TSLAx", "10000000")],
    slippageBps: 100,
    feePayer: PAYER,
    nonceAccount: PAYER,
    dapp: "app.pixstock.xyz",
    quotedAt: 1_789_200_000,
  },
  ...over,
});

describe("signing request", () => {
  it("round-trips every field", () => {
    const original = request({ price: new Uint8Array(145).fill(3) });
    const decoded = decodePayload(encodePayload(original)) as SignRequest;

    expect(decoded.kind).toBe("SIGN");
    expect(decoded.sid).toEqual(original.sid);
    expect(decoded.vault).toBe(VAULT);
    expect(decoded.txs).toEqual(original.txs);
    expect(decoded.price).toEqual(original.price);
    expect(decoded.manifest).toEqual(original.manifest);
  });

  it("keeps amounts exact — they are u64, never floats", () => {
    // Larger than Number.MAX_SAFE_INTEGER: a float round-trip would corrupt it.
    const huge = "18446744073709551615";
    const decoded = decodePayload(
      encodePayload(request({ manifest: { ...request().manifest, legs: [{ ...leg("TSLAx", huge) }] } }))
    ) as SignRequest;
    expect(decoded.manifest.legs[0]!.inAmount).toBe(huge);
  });

  it("omits the attestation rather than sending an empty one", () => {
    const decoded = decodePayload(encodePayload(request())) as SignRequest;
    expect(decoded.price).toBeUndefined();
  });

  it("carries the optional leg fields only when they are set", () => {
    const bare = request({
      manifest: {
        ...request().manifest,
        legs: [{ inMint: USDC_MINT, outMint: tesla.mint, inAmount: "1", expectedOutAmount: "2" }],
      },
    });
    const decoded = decodePayload(encodePayload(bare)) as SignRequest;
    expect(decoded.manifest.legs[0]).toEqual({
      inMint: USDC_MINT,
      outMint: tesla.mint,
      inAmount: "1",
      expectedOutAmount: "2",
    });
  });
});

describe("signing response", () => {
  it("round-trips signatures", () => {
    const original: SignResponse = {
      kind: "SIGR",
      sid: newSessionId(),
      signatures: [new Uint8Array(64).fill(1), new Uint8Array(64).fill(2)],
    };
    expect(decodePayload(encodePayload(original))).toEqual(original);
  });
});

describe("pairing record", () => {
  it("round-trips", () => {
    const original: PairRecord = {
      kind: "PAIR",
      vault: VAULT,
      label: "Old Pixel in the drawer",
      network: "devnet",
    };
    expect(decodePayload(encodePayload(original))).toEqual(original);
  });
});

describe("rejections", () => {
  const corrupt = (mutate: (r: SignRequest) => void) => {
    const r = request();
    mutate(r);
    return () => encodePayload(r);
  };

  it("refuses a session id of the wrong length", () => {
    expect(corrupt((r) => (r.sid = new Uint8Array(4)))).toThrow(/sid is 4 bytes/);
  });

  it("refuses a vault key that is not 32 bytes", () => {
    expect(corrupt((r) => (r.vault = "11111111111111111111111111111111111111111111"))).toThrow(
      /vault decodes to/
    );
  });

  it("refuses a vault key that is not base58", () => {
    expect(corrupt((r) => (r.vault = "not base58 at all!!"))).toThrow(/not base58/);
  });

  it("refuses bytes that are not CBOR", () => {
    expect(() => decodePayload(Uint8Array.from([0xff, 0xff, 0xff, 0xff]))).toThrow(
      /not valid CBOR|not a map/
    );
  });

  it("refuses a payload version it does not know", () => {
    const encoded = encodePayload(request());
    // The version is the first map value; flipping it must be caught.
    const tampered = Uint8Array.from(encoded);
    const index = tampered.indexOf(0x01);
    tampered[index] = 0x09;
    expect(() => decodePayload(tampered)).toThrow(/unsupported payload version|not valid CBOR/);
  });

  it("refuses a request with no transaction", () => {
    expect(() => decodePayload(encodePayload(request({ txs: [] })))).toThrow(/no transaction/);
  });

  it("refuses a manifest with no legs", () => {
    const empty = request();
    empty.manifest.legs = [];
    expect(() => decodePayload(encodePayload(empty))).toThrow(/no legs/);
  });
});

describe("measured sizes", () => {
  // The numbers docs/AGQP-SPEC.md §3 publishes. If a schema change moves them,
  // the frame count moves with it and the demo timing changes.
  it("puts a single swap in 4 frames", () => {
    const payload = encodePayload(request({ price: new Uint8Array(145) }));
    expect(payload.length).toBeGreaterThan(900);
    expect(payload.length).toBeLessThan(1200);
    expect(encodeFrames(payload, { sid: newSessionId() })).toHaveLength(4);
  });

  it("puts a three-leg basket in 5 frames", () => {
    const basket = request({
      price: new Uint8Array(205),
      manifest: {
        ...request().manifest,
        kind: "BASKET",
        legs: [leg("AAPLx", "166666666"), leg("NVDAx", "166666666"), leg("MSFTx", "166666666")],
      },
    });
    const payload = encodePayload(basket);
    expect(payload.length).toBeLessThan(1500);
    expect(encodeFrames(payload, { sid: newSessionId(), size: "M" })).toHaveLength(5);
    // 5 frames at 8 FPS is 625 ms per cycle — the basis of the demo claim.
    expect(Math.ceil(payload.length / CHUNK_SIZES.M)).toBe(5);
  });
});

/**
 * Mint state on the wire.
 *
 * The multiplier is the one number on the vault's ticket that is not read out
 * of the transaction — it cannot be, it lives on the mint and the vault has
 * no network. So it rides here, and what the encoder must guarantee is that
 * it arrives as it left, or not at all.
 */
describe("mint facts", () => {
  const MINT = ASSETS[0]!.mint;
  const OTHER = ASSETS[1]!.mint;
  const DELEGATE = "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq";

  const withMints = (mints: unknown): SignRequest => {
    const base = request();
    return { ...base, manifest: { ...base.manifest, mints } as SignRequest["manifest"] };
  };

  it("round-trips a multiplier without losing a digit", () => {
    // A float64 read off the mint. Anything short of exact equality here is a
    // different amount on the screen the holder signs from.
    const multiplier = 1.0026642075893797;
    const decoded = decodePayload(encodePayload(withMints([{ mint: MINT, multiplier, readAt: 1757690000 }])));
    const facts = (decoded as SignRequest).manifest.mints!;
    expect(facts).toHaveLength(1);
    expect(facts[0]!.multiplier).toBe(multiplier);
    expect(facts[0]!.mint).toBe(MINT);
    expect(facts[0]!.readAt).toBe(1757690000);
  });

  it("carries the issuer's powers and the scheduled change", () => {
    const decoded = decodePayload(
      encodePayload(
        withMints([
          {
            mint: MINT,
            multiplier: 1.002,
            nextMultiplier: 1.05,
            nextMultiplierAt: 1789300000,
            permanentDelegate: DELEGATE,
            paused: true,
            readAt: 1757690000,
          },
        ]),
      ),
    );
    expect((decoded as SignRequest).manifest.mints![0]).toEqual({
      mint: MINT,
      multiplier: 1.002,
      nextMultiplier: 1.05,
      nextMultiplierAt: 1789300000,
      permanentDelegate: DELEGATE,
      paused: true,
      readAt: 1757690000,
    });
  });

  it("leaves a scheduled multiplier off the wire when it is the current one", () => {
    const decoded = decodePayload(
      encodePayload(
        withMints([
          { mint: MINT, multiplier: 1.002, nextMultiplier: 1.002, nextMultiplierAt: 9, readAt: 1 },
        ]),
      ),
    );
    expect((decoded as SignRequest).manifest.mints![0]!.nextMultiplier).toBeUndefined();
  });

  it("will not carry a scheduled multiplier without the date it lands", () => {
    // "A new multiplier is coming" tells the holder nothing they can act on.
    const decoded = decodePayload(
      encodePayload(withMints([{ mint: MINT, multiplier: 1.002, nextMultiplier: 1.05, readAt: 1 }])),
    );
    expect((decoded as SignRequest).manifest.mints![0]!.nextMultiplier).toBeUndefined();
  });

  it("says nothing at all when there is nothing to say", () => {
    const decoded = decodePayload(encodePayload(withMints([])));
    expect((decoded as SignRequest).manifest.mints).toBeUndefined();
  });

  it("refuses the same mint declared twice", () => {
    // Two entries would let a sender show one multiplier and have another
    // applied, depending on which the reader reached first.
    const payload = encodePayload(
      withMints([
        { mint: MINT, multiplier: 1.002, readAt: 1 },
        { mint: MINT, multiplier: 9, readAt: 1 },
      ]),
    );
    expect(() => decodePayload(payload)).toThrow(/twice/);
  });

  it("keeps distinct mints apart", () => {
    const decoded = decodePayload(
      encodePayload(
        withMints([
          { mint: MINT, multiplier: 1.002, readAt: 1 },
          { mint: OTHER, multiplier: 1.004, readAt: 1 },
        ]),
      ),
    );
    expect((decoded as SignRequest).manifest.mints!.map((f) => f.mint)).toEqual([MINT, OTHER]);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["not a number", "1.002"],
    ["infinite", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
  ])("refuses a multiplier that is %s", (_label, multiplier) => {
    const encode = () => encodePayload(withMints([{ mint: MINT, multiplier, readAt: 1 }]));
    // Infinity and NaN survive CBOR, so they are caught on the way back in;
    // the rest fail one side or the other. Either way they never reach policy.
    let threw = false;
    try {
      decodePayload(encode());
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("refuses mint state that is not a list", () => {
    expect(() => decodePayload(encodePayload(withMints({ [MINT]: 1.002 })))).toThrow();
  });
});

/**
 * The session id travels twice: in every frame header, and inside the CBOR.
 * AGQP-SPEC section 2 says the two are compared, and for a while nothing
 * compared them — which made the second copy decoration. A payload lifted out
 * of one session and re-wrapped in another session's frames would have been
 * read as if it belonged there.
 */
describe("the session id inside the payload", () => {
  it("is accepted when it matches the frames it arrived in", () => {
    const sid = newSessionId();
    const original = request({ sid });
    const decoded = decodePayload(encodePayload(original), {
      sid: encodeSessionId(sid),
    }) as SignRequest;
    expect(decoded.sid).toEqual(sid);
  });

  it("refuses a payload that belongs to another session", () => {
    const original = request({ sid: newSessionId() });
    expect(() =>
      decodePayload(encodePayload(original), { sid: encodeSessionId(newSessionId()) }),
    ).toThrow(/belongs to session .*, but it arrived in the frames of session/);
  });

  it("checks a signature reply the same way", () => {
    const sid = newSessionId();
    const reply: SignResponse = { kind: "SIGR", sid, signatures: [new Uint8Array(64).fill(9)] };
    expect(() =>
      decodePayload(encodePayload(reply), { sid: encodeSessionId(newSessionId()) }),
    ).toThrow(/belongs to session/);
    expect(decodePayload(encodePayload(reply), { sid: encodeSessionId(sid) })).toEqual(reply);
  });

  it("leaves a pairing record alone, because it carries no session", () => {
    const pair: PairRecord = {
      kind: "PAIR",
      vault: VAULT,
      label: "Kitchen drawer",
      network: "mainnet",
    };
    expect(decodePayload(encodePayload(pair), { sid: encodeSessionId(newSessionId()) })).toEqual(
      pair,
    );
  });

  it("still decodes when no session id is offered to compare", () => {
    const original = request();
    expect(decodePayload(encodePayload(original))).toEqual(original);
  });
});
