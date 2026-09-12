import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import {
  ENFORCED_RULES,
  MAX_RENT_LAMPORTS,
  RELAYER_RULES,
  UNENFORCED_RULES,
  checkRelayerPolicy,
  sha256Hex,
  type RelayerRule,
} from "../src/modules/orders/relayer-policy";

/**
 * The relayer's side of the transaction, on the recorded basket the relayer
 * really built.
 *
 * These rules protect the hot key from whoever is talking to it, where
 * P1..P10 protect the holder from the relayer. Both are needed: neither party
 * is asked to trust the other.
 */
const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/tx-policy/test/fixtures/basket-order.json", import.meta.url),
    "utf8"
  )
) as { vault: string; vaultSeed: string; feePayer: string; messages: string[] };

const messageBytes = Uint8Array.from(Buffer.from(fixture.messages[0]!, "base64"));
const seed = Uint8Array.from(Buffer.from(fixture.vaultSeed, "base64"));
const signature = ed25519.sign(messageBytes, seed);

const base = {
  messageBytes,
  expectedHash: sha256Hex(messageBytes),
  signature,
  vault: fixture.vault,
  relayer: fixture.feePayer,
  status: "AWAITING_SIGNATURE",
  alreadySigned: false,
  maxComputeUnitPrice: 1_000_000n,
};

const check = (over: Partial<typeof base> = {}) => checkRelayerPolicy({ ...base, ...over });
const fired = (rule: RelayerRule, violations: ReturnType<typeof check>) =>
  violations.some((v) => v.rule === rule);

describe("an honest signature", () => {
  it("passes every enforced rule", () => {
    expect(check()).toEqual([]);
  });

  it("names the rules it does not enforce", () => {
    // R6 runs as a simulation once the signature is accepted, which is a
    // different question from whether it may be signed. R7 still needs a quota
    // store and a balance alert.
    expect(UNENFORCED_RULES).toEqual(["R7"]);
    expect(ENFORCED_RULES).toContain("R6");
  });

  it("accounts for every rule, so none can be forgotten", () => {
    expect([...ENFORCED_RULES, ...UNENFORCED_RULES].sort()).toEqual(
      Object.keys(RELAYER_RULES).sort()
    );
  });
});

describe("refusals", () => {
  it("R1 — a message that is not the one this relayer built", () => {
    expect(fired("R1", check({ expectedHash: sha256Hex(new Uint8Array([1, 2, 3])) }))).toBe(true);
  });

  it("R1 — an order that is not awaiting a signature", () => {
    expect(fired("R1", check({ status: "CONFIRMED" }))).toBe(true);
  });

  it("R1 — a message that cannot be decoded at all", () => {
    const junk = Uint8Array.from([9, 9, 9, 9]);
    const violations = check({ messageBytes: junk, expectedHash: sha256Hex(junk) });
    expect(fired("R1", violations)).toBe(true);
  });

  it("R2 — a signature from another key", () => {
    const stranger = crypto.getRandomValues(new Uint8Array(32));
    expect(fired("R2", check({ signature: ed25519.sign(messageBytes, stranger) }))).toBe(true);
  });

  it("R2 — a signature over a different message", () => {
    const other = Uint8Array.from(messageBytes);
    other[10] ^= 0xff;
    expect(fired("R2", check({ signature: ed25519.sign(other, seed) }))).toBe(true);
  });

  it("R2 — a signature that is not one at all", () => {
    expect(fired("R2", check({ signature: new Uint8Array(64) }))).toBe(true);
  });

  it("R3 — a transaction whose fee payer is somebody else", () => {
    const stranger = base58.encode(ed25519.getPublicKey(crypto.getRandomValues(new Uint8Array(32))));
    expect(fired("R3", check({ relayer: stranger }))).toBe(true);
  });

  it("R8 — a second signature for the same order", () => {
    // Co-signing twice would pay fees twice for one order.
    expect(fired("R8", check({ alreadySigned: true }))).toBe(true);
  });

  it("reports every rule a bad request breaks, not just the first", () => {
    const violations = check({ status: "EXPIRED", alreadySigned: true, signature: new Uint8Array(64) });
    expect(new Set(violations.map((v) => v.rule))).toEqual(new Set(["R1", "R2", "R8"]));
  });
});

describe("the caps", () => {
  it("allows rent up to the documented ceiling", () => {
    expect(MAX_RENT_LAMPORTS).toBe(10_000_000);
  });

  it("has a statement for every rule", () => {
    for (const rule of Object.keys(RELAYER_RULES) as RelayerRule[]) {
      expect(RELAYER_RULES[rule].length).toBeGreaterThan(20);
    }
  });
});
