import { describe, expect, it } from "vitest";
import {
  MAX_SIGNATURES,
  SIGNATURE_BYTES,
  encodeSessionId,
  encodeSignatureResponse,
  newSessionId,
  parseSignatureResponse,
} from "../src/index.js";

const QR_ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]+$/;

const signatureOf = (seed: number) =>
  Uint8Array.from({ length: SIGNATURE_BYTES }, (_, i) => (i * 13 + seed) % 256);

describe("signature response", () => {
  it("round-trips one signature", () => {
    const sid = newSessionId();
    const signature = signatureOf(1);

    const parsed = parseSignatureResponse(encodeSignatureResponse(sid, [signature]));

    expect(parsed).not.toBeNull();
    expect(parsed!.sid).toBe(encodeSessionId(sid));
    expect(parsed!.signatures).toEqual([signature]);
  });

  it("round-trips a split basket", () => {
    const sid = newSessionId();
    const signatures = [signatureOf(1), signatureOf(2)];
    expect(parseSignatureResponse(encodeSignatureResponse(sid, signatures))!.signatures).toEqual(
      signatures
    );
  });

  it("fits in a single small QR", () => {
    const encoded = encodeSignatureResponse(newSessionId(), [signatureOf(1)]);
    // QR version 5-M holds 122 alphanumeric characters.
    expect(encoded.length).toBeLessThanOrEqual(122);
    expect(encoded).toMatch(QR_ALPHANUMERIC);
  });

  it("carries the session id back, so a stale reply is detectable", () => {
    const a = newSessionId();
    const b = newSessionId();
    const parsed = parseSignatureResponse(encodeSignatureResponse(a, [signatureOf(1)]))!;
    expect(parsed.sid).not.toBe(encodeSessionId(b));
  });

  it.each([
    ["a request frame", "PS1:WG9P1:01:05:32EC5E76:AB"],
    ["plain text", "hello"],
    ["an empty string", ""],
    ["a truncated body", "SIGR:AB"],
    ["invalid base45", "SIGR:!!!!"],
  ])("rejects %s", (_label, text) => {
    expect(parseSignatureResponse(text)).toBeNull();
  });

  it("rejects a body whose length disagrees with its count", () => {
    const encoded = encodeSignatureResponse(newSessionId(), [signatureOf(1)]);
    expect(parseSignatureResponse(encoded.slice(0, -3))).toBeNull();
  });

  it("refuses to encode a wrong-sized signature", () => {
    expect(() => encodeSignatureResponse(newSessionId(), [new Uint8Array(32)])).toThrow(
      /signature is 64 bytes/
    );
  });

  it("refuses to encode nothing, or too many", () => {
    expect(() => encodeSignatureResponse(newSessionId(), [])).toThrow(/1 to 4/);
    expect(() =>
      encodeSignatureResponse(newSessionId(), Array.from({ length: MAX_SIGNATURES + 1 }, () => signatureOf(1)))
    ).toThrow(/1 to 4/);
  });
});
