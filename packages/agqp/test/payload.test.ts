import { describe, expect, it } from "vitest";
import { ASSETS, USDC_MINT } from "@pixstock/shared";
import {
  CHUNK_SIZES,
  decodePayload,
  encodeFrames,
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
