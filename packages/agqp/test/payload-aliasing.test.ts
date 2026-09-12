import { describe, expect, it } from "vitest";
import { encodePayload, newSessionId, type PairRecord } from "../src/index.js";

const pair = (label: string): PairRecord => ({
  kind: "PAIR",
  vault: "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
  label,
  network: "devnet",
});

describe("an encoded payload is the caller's to keep", () => {
  it("does not change when something else is encoded afterwards", () => {
    // cbor-x writes into a reused arena and returns a view of it. Without a
    // copy, holding a payload across another encode silently corrupts it —
    // and the payload is what gets signed.
    const first = encodePayload(pair("first vault"));
    const snapshot = Uint8Array.from(first);

    for (let i = 0; i < 20; i++) encodePayload(pair(`other vault ${i} with a longer label`));

    expect(first).toEqual(snapshot);
  });

  it("is a plain Uint8Array, so it compares equal to what comes off the wire", () => {
    const encoded = encodePayload(pair("a vault"));
    expect(encoded.constructor).toBe(Uint8Array);
    // A Buffer would fail this against the Uint8Array a frame assembler returns.
    expect(encoded).toEqual(Uint8Array.from(encoded));
  });

  it("owns its buffer rather than viewing a larger one", () => {
    const encoded = encodePayload(pair("a vault"));
    expect(encoded.byteOffset).toBe(0);
    expect(encoded.buffer.byteLength).toBe(encoded.length);
  });

  it("gives a different array each time, never the same view twice", () => {
    const sid = newSessionId();
    const a = encodePayload({ kind: "SIGR", sid, signatures: [new Uint8Array(64).fill(1)] });
    const b = encodePayload({ kind: "SIGR", sid, signatures: [new Uint8Array(64).fill(2)] });
    expect(a.buffer).not.toBe(b.buffer);
    expect(a).not.toEqual(b);
  });
});
