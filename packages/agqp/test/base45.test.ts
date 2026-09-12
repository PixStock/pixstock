import { describe, expect, it } from "vitest";
import { toBase45, fromBase45 } from "../src/base45.js";
import { crc32 } from "../src/crc32.js";

const encoder = new TextEncoder();

describe("base45", () => {
  // Test vectors from RFC 9285 §4.
  it.each([
    ["AB", "BB8"],
    ["Hello!!", "%69 VD92EX0"],
    ["base-45", "UJCLQE7W581"],
  ])("encodes %j as %j", (input, expected) => {
    expect(toBase45(encoder.encode(input))).toBe(expected);
  });

  it("round-trips arbitrary payloads", () => {
    for (let length = 0; length < 200; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + length) % 256);
      expect(fromBase45(toBase45(bytes))).toEqual(bytes);
    }
  });

  it("rejects a character outside the alphabet", () => {
    expect(() => fromBase45("AB!")).toThrow(/outside the alphabet/);
  });

  it("rejects a truncated input", () => {
    expect(() => fromBase45("BB8B")).toThrow(/truncated/);
  });
});

describe("crc32", () => {
  // Canonical IEEE 802.3 check value.
  it('returns 0xcbf43926 for "123456789"', () => {
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
  });

  it("returns 0 for an empty payload", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("detects a single flipped bit", () => {
    const bytes = encoder.encode("a readable order ticket");
    const mutated = Uint8Array.from(bytes);
    mutated[3] ^= 0b0000_0001;
    expect(crc32(mutated)).not.toBe(crc32(bytes));
  });
});
