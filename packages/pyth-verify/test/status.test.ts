import { describe, expect, it } from "vitest";
import {
  MAX_DEVIATION,
  VERIFIER_IMPLEMENTED,
  checkAttestation,
  permitsSigning,
  type AttestationStatus,
} from "../src/index.js";

describe("what the vault may claim about a price", () => {
  it("reports an absent attestation as absent", () => {
    expect(checkAttestation({}).state).toBe("absent");
    expect(checkAttestation({ price: new Uint8Array(0) }).state).toBe("absent");
  });

  it("never claims a price is verified while the verifier is unwritten", () => {
    // The guard that matters. Deleting the verifier's implementation must not
    // silently turn into a green tick on the signing screen — which is the
    // exact deception feature D exists to defeat.
    for (const length of [1, 64, 145, 205, 1200]) {
      const status = checkAttestation({ price: new Uint8Array(length).fill(9) });
      expect(status.state, `${length} bytes`).not.toBe("verified");
    }
  });

  it("says plainly that an attached attestation is unchecked", () => {
    const status = checkAttestation({ price: new Uint8Array(145) });
    expect(status.state).toBe("unverifiable");
    expect(status.label).toMatch(/not verified/i);
    expect(status.detail).toMatch(/145 bytes/);
  });

  it("keeps the flag and the behaviour in step", () => {
    // If someone flips VERIFIER_IMPLEMENTED without writing the verifier, this
    // test is what tells them.
    expect(VERIFIER_IMPLEMENTED).toBe(false);
    expect(checkAttestation({ price: new Uint8Array(145) }).state).toBe("unverifiable");
  });
});

describe("strict mode", () => {
  const verified = (deviation: number): AttestationStatus => ({
    state: "verified",
    label: "Price verified",
    detail: "",
    deviation,
    ageSeconds: 3,
    warn: false,
  });

  it("refuses to sign anything unverified", () => {
    expect(permitsSigning(checkAttestation({}), true)).toBe(false);
    expect(permitsSigning(checkAttestation({ price: new Uint8Array(145) }), true)).toBe(false);
  });

  it("refuses a verified price that has drifted too far", () => {
    expect(permitsSigning(verified(MAX_DEVIATION + 0.0001), true)).toBe(false);
    expect(permitsSigning(verified(MAX_DEVIATION), true)).toBe(true);
  });

  it("allows an unverified price only when strictness is turned off", () => {
    expect(permitsSigning(checkAttestation({ price: new Uint8Array(145) }), false)).toBe(true);
  });
});
