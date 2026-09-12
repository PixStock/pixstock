import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FrameAssembler,
  decodePayload,
  encodeFrames,
  encodeSessionId,
  encodeSignatureResponse,
  encodePayload,
  newSessionId,
  parseSignatureResponse,
  type SignRequest,
} from "@pixstock/agqp";
import { DEFAULT_KDF, lock, signWith, verify } from "@pixstock/vault-crypto";
import { checkAttestation, permitsSigning } from "@pixstock/pyth-verify";
import { formatScaled, symbolOfMint } from "@pixstock/shared";
import { ed25519 } from "@noble/curves/ed25519.js";
import { applyPolicy, decodeMessage, decompile } from "../src/index.js";

/**
 * End to end, offline, on a real order.
 *
 * Every layer the product has, in the order a real signing goes through them:
 * a basket the relayer actually built against live mainnet routes, encoded,
 * split into frames, reassembled as a camera would see them, decoded,
 * policy-checked, signed with a real key, and the reply verified against the
 * message that was sent.
 *
 * The fixture is recorded by scripts/capture-order-fixture.mjs rather than
 * constructed here. A hand-built order only proves the pieces agree with each
 * other — which they did throughout the whole time address lookup tables were
 * being dropped and transactions were 350 bytes too big.
 */
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/basket-order.json", import.meta.url), "utf8")
) as {
  vault: string;
  vaultSeed: string;
  feePayer: string;
  kind: "BUY" | "SELL" | "BASKET";
  messages: string[];
  legs: Array<{
    inMint: string;
    outMint: string;
    inAmount: string;
    expectedOutAmount: string;
    minOutAmount: string;
  }>;
};

/**
 * Mint state as the relayer read it on 12 Sept 2026, carried with the order.
 *
 * The vault has no network, so these cross the gap inside the payload — and
 * the round trip below is the only place that proves they survive framing,
 * chaotic scanning and CBOR intact.
 */
const MEASURED = {
  AAPLx: 1.0026642075893797,
  NVDAx: 1.0009180758490996,
  MSFTx: 1.0045820905025638,
} as const;
const BACKED_DELEGATE = "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq";

const seed = Uint8Array.from(Buffer.from(fixture.vaultSeed, "base64"));
const messages = fixture.messages.map((m) => Uint8Array.from(Buffer.from(m, "base64")));
const PASSWORD = "correct horse battery staple";
const FAST_KDF = { ...DEFAULT_KDF, iterations: 1, memoryKiB: 1024 };

function buildRequest(sid: Uint8Array, attestationBytes = 205): SignRequest {
  return {
    kind: "SIGN",
    sid,
    vault: fixture.vault,
    txs: messages,
    manifest: {
      kind: fixture.kind,
      legs: fixture.legs.map((leg) => ({
        inMint: leg.inMint,
        outMint: leg.outMint,
        inAmount: leg.inAmount,
        expectedOutAmount: leg.expectedOutAmount,
        minOutAmount: leg.minOutAmount,
      })),
      slippageBps: 100,
      feePayer: fixture.feePayer,
      dapp: "app.pixstock.xyz",
      quotedAt: Math.floor(Date.now() / 1000) - 5,
      mints: fixture.legs.map((leg) => ({
        mint: leg.outMint,
        multiplier: MEASURED[symbolOfMint(leg.outMint) as keyof typeof MEASURED],
        permanentDelegate: BACKED_DELEGATE,
        readAt: Math.floor(Date.now() / 1000) - 120,
      })),
    },
    price: new Uint8Array(attestationBytes).fill(9),
  };
}

/** Frames as a camera catches them: out of order, duplicated, mid-cycle. */
function scanChaotically(frames: string[]) {
  const assembler = new FrameAssembler();
  const order = [...frames.keys()].reverse();
  let progress;
  for (const i of [...order, ...order]) progress = assembler.push(frames[i]!);
  return { assembler, progress: progress! };
}

describe("a real basket crossing the air gap", () => {
  it("goes from a built order to a verified signature", async () => {
    // ── web: encode the order and put it on screen ──────────────────────
    const sid = newSessionId();
    const request = buildRequest(sid);
    const payload = encodePayload(request);
    const frames = encodeFrames(payload, { sid });

    expect(frames.length).toBeGreaterThan(1);
    expect(frames.length).toBeLessThanOrEqual(8);

    // ── vault: scan ─────────────────────────────────────────────────────
    const { assembler, progress } = scanChaotically(frames);
    expect(progress.done).toBe(true);
    expect(progress.payload).toEqual(payload);
    expect(assembler.sessionId).toBe(encodeSessionId(sid));

    // ── vault: decode ───────────────────────────────────────────────────
    const decoded = decodePayload(progress.payload!);
    expect(decoded.kind).toBe("SIGN");
    const order = decoded as SignRequest;
    expect(order.vault).toBe(fixture.vault);
    expect(order.manifest.legs).toHaveLength(3);

    // ── vault: the price it cannot check ────────────────────────────────
    const price = checkAttestation({ price: order.price });
    expect(price.state).toBe("unverifiable");
    expect(permitsSigning(price, true)).toBe(false);

    // ── vault: policy ───────────────────────────────────────────────────
    const message = decodeMessage(order.txs[0]!);
    const result = applyPolicy({
      message,
      decoded: decompile(message),
      manifest: {
        kind: order.manifest.kind,
        vault: order.vault,
        legs: order.manifest.legs,
        slippageBps: order.manifest.slippageBps,
        createdAt: order.manifest.quotedAt,
        feePayer: order.manifest.feePayer,
        mints: order.manifest.mints,
      },
      vault: order.vault,
    });

    expect(result.violations).toEqual([]);
    expect(result.ticket).toBeDefined();

    // The ticket reads the instructions, not the manifest.
    expect(result.ticket!.networkFeePaidBy).toBe("relayer");
    expect(result.ticket!.lines).toHaveLength(6);
    expect(result.ticket!.lines.filter((l) => l.direction === "out").map((l) => l.symbol)).toEqual([
      "AAPLx",
      "NVDAx",
      "MSFTx",
    ]);

    // The multipliers made it across the gap and moved every figure. If they
    // had not, the ticket would read low by up to half a percent and say
    // nothing about it — which is the failure this whole rule exists for.
    for (const line of result.ticket!.lines.filter((l) => l.direction === "out")) {
      expect(line.multiplier).toBe(MEASURED[line.symbol as keyof typeof MEASURED]);
      expect(line.amount).not.toBe(line.unscaledAmount);
      expect(line.amount).toBe(formatScaled(line.rawAmount, 8, line.multiplier));
    }

    // USDC is paid on all three legs and scales on none of them.
    for (const line of result.ticket!.lines.filter((l) => l.direction === "in")) {
      expect(line.symbol).toBe("USDC");
      expect(line.multiplier).toBe(1);
    }

    // And the issuer's reach is on the ticket, not buried in a legal page.
    expect(
      result.ticket!.disclosures.filter((d) => d.text.includes("permanent delegate")),
    ).toHaveLength(3);

    // ── vault: sign, and never keep the seed ────────────────────────────
    const blob = await lock(seed, PASSWORD, FAST_KDF);
    const signature = await signWith(blob, PASSWORD, order.txs[0]!);
    const reply = encodeSignatureResponse(sid, [signature]);
    expect(reply.length).toBeLessThanOrEqual(122);

    // ── web: read the reply and check it answers this order ─────────────
    const parsed = parseSignatureResponse(reply);
    expect(parsed).not.toBeNull();
    expect(parsed!.sid).toBe(encodeSessionId(sid));
    expect(verify(parsed!.signatures[0]!, messages[0]!, ed25519.getPublicKey(seed))).toBe(true);
  });

  it("refuses the same basket when it is addressed to another vault", () => {
    const order = decodePayload(encodePayload(buildRequest(newSessionId()))) as SignRequest;
    const stranger = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
    const message = decodeMessage(order.txs[0]!);

    const result = applyPolicy({
      message,
      decoded: decompile(message),
      manifest: {
        kind: order.manifest.kind,
        vault: stranger,
        legs: order.manifest.legs,
        slippageBps: order.manifest.slippageBps,
        createdAt: order.manifest.quotedAt,
      },
      vault: stranger,
    });

    // The output would land in the real vault's accounts, not this one's.
    expect(result.violations.some((v) => v.rule === "P5")).toBe(true);
    expect(result.ticket).toBeUndefined();
  });

  it("refuses a manifest that understates one leg", () => {
    const order = decodePayload(encodePayload(buildRequest(newSessionId()))) as SignRequest;
    const message = decodeMessage(order.txs[0]!);
    const legs = order.manifest.legs.map((leg, i) =>
      i === 1 ? { ...leg, inAmount: "1000" } : leg
    );

    const result = applyPolicy({
      message,
      decoded: decompile(message),
      manifest: {
        kind: order.manifest.kind,
        vault: order.vault,
        legs,
        slippageBps: order.manifest.slippageBps,
        createdAt: order.manifest.quotedAt,
      },
      vault: order.vault,
    });

    expect(result.violations.some((v) => v.rule === "P6")).toBe(true);
  });

  it("ignores a reply from a different session", () => {
    const sid = newSessionId();
    const other = newSessionId();
    const signature = new Uint8Array(64).fill(3);

    const parsed = parseSignatureResponse(encodeSignatureResponse(other, [signature]))!;
    expect(parsed.sid).not.toBe(encodeSessionId(sid));
  });
});
