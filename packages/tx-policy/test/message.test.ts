import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROGRAM_IDS } from "@pixstock/shared";
import {
  decodeMessage,
  decodeShortVec,
  encodeShortVec,
  feePayerOf,
  isSigner,
  isWritable,
  parseTransaction,
  programIdOf,
} from "../src/index.js";

/**
 * A real Jupiter mainnet swap, captured with `scripts/capture-jupiter-fixture.mjs`.
 * Built with payer != user, which is the arrangement the whole product rests
 * on. Re-capture it if Jupiter changes its instruction layout; a synthetic
 * message would only prove the decoder agrees with itself.
 */
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/jupiter-swap.json", import.meta.url), "utf8")
) as {
  vault: string;
  payer: string;
  swapTransaction: string;
};

const transactionBytes = Uint8Array.from(Buffer.from(fixture.swapTransaction, "base64"));

describe("shortvec", () => {
  it.each([
    [0, 1],
    [127, 1],
    [128, 2],
    [16383, 2],
    [16384, 3],
    [65535, 3],
  ])("round-trips %i in %i byte(s)", (value, expectedLength) => {
    const encoded = encodeShortVec(value);
    expect(encoded).toHaveLength(expectedLength);
    expect(decodeShortVec(encoded, 0)).toEqual({ value, bytesRead: expectedLength });
  });

  it("reads from an offset", () => {
    const bytes = Uint8Array.from([0xff, 0xff, ...encodeShortVec(300)]);
    expect(decodeShortVec(bytes, 2).value).toBe(300);
  });

  it("refuses a value it cannot represent", () => {
    expect(() => encodeShortVec(65536)).toThrow(/out of compact-u16 range/);
  });

  it("refuses a truncated prefix", () => {
    expect(() => decodeShortVec(Uint8Array.from([0x80]), 0)).toThrow(/truncated/);
  });
});

describe("a real Jupiter swap", () => {
  const tx = parseTransaction(transactionBytes);

  it("is a v0 message", () => {
    expect(tx.message.version).toBe(0);
  });

  it("carries two empty signature slots — the vault's and the payer's", () => {
    expect(tx.signatures).toHaveLength(2);
    expect(tx.message.header.numRequiredSignatures).toBe(2);
  });

  it("uses an address lookup table", () => {
    expect(tx.message.addressTableLookups.length).toBeGreaterThan(0);
  });

  it("pays fees from the relayer, never the vault", () => {
    // The Zero-SOL promise, checked against a real route rather than a
    // hand-built message: if this flips, the vault is funding its own fees
    // and rent, and the product's central claim is false.
    expect(feePayerOf(tx.message)).toBe(fixture.payer);
    expect(feePayerOf(tx.message)).not.toBe(fixture.vault);
  });

  it("still requires the vault to sign", () => {
    const index = tx.message.staticAccountKeys.indexOf(fixture.vault);
    expect(index).toBeGreaterThan(0);
    expect(isSigner(tx.message, index)).toBe(true);
  });

  it("marks the fee payer writable and the vault read-only", () => {
    expect(isWritable(tx.message, 0)).toBe(true);
    expect(isWritable(tx.message, tx.message.staticAccountKeys.indexOf(fixture.vault))).toBe(false);
  });

  it("routes through Jupiter, after creating the destination token account", () => {
    const programs = tx.message.instructions.map((ix) => programIdOf(tx.message, ix));
    expect(programs).toContain(PROGRAM_IDS.jupiterV6);
    expect(programs).toContain(PROGRAM_IDS.associatedToken);
  });

  it("exposes the exact bytes that get signed", () => {
    // 1 length byte + 2 * 64 signature bytes.
    expect(tx.messageBytes).toHaveLength(transactionBytes.length - 129);
    expect(decodeMessage(tx.messageBytes)).toEqual(tx.message);
  });
});

describe("malformed input", () => {
  it("refuses a message version it does not know", () => {
    const bytes = Uint8Array.from([0x81, 1, 0, 0]);
    expect(() => decodeMessage(bytes)).toThrow(/unsupported message version 1/);
  });

  it("refuses a truncated message", () => {
    const tx = parseTransaction(transactionBytes);
    expect(() => decodeMessage(tx.messageBytes.slice(0, 40))).toThrow(
      /unexpected end of message|wanted \d+ bytes/
    );
  });

  it("names an unresolvable program rather than guessing", () => {
    const tx = parseTransaction(transactionBytes);
    const throughLookup = { ...tx.message.instructions[0]!, programIdIndex: 250 };
    expect(programIdOf(tx.message, throughLookup)).toBe("lookup:250");
  });
});
