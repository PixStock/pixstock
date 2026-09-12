/**
 * What the vault is allowed to say about an order's price.
 *
 * This exists because the honest answer changes as the verifier is built, and
 * the screen must never run ahead of it. While `VERIFIER_IMPLEMENTED` is
 * false, no input can produce a `verified` status — a test enforces that.
 *
 * Showing a green tick beside "price attested" because a blob happened to be
 * attached would be the first lie told by a product whose entire argument is
 * that it does not lie to you. It is also exactly the deception feature D
 * exists to defeat: a compromised relayer can attach any bytes it likes.
 */

/** Flip to true in the same commit that makes `verify` real. */
export const VERIFIER_IMPLEMENTED = false;

/** Above this the vault refuses to sign. See docs/THREAT-MODEL.md. */
export const MAX_DEVIATION = 0.01;
/** Between this and the maximum, the vault warns but allows. */
export const WARN_DEVIATION = 0.005;
/** A price older than this is stale, whatever it says. */
export const MAX_AGE_SECONDS = 120;

export type AttestationStatus =
  | { state: "absent"; label: string; detail: string }
  | { state: "unverifiable"; label: string; detail: string }
  | { state: "rejected"; label: string; detail: string }
  | {
      state: "verified";
      label: string;
      detail: string;
      /** Signed relative deviation, e.g. 0.012 for +1.2%. */
      deviation: number;
      ageSeconds: number;
      /** True between WARN_DEVIATION and MAX_DEVIATION. */
      warn: boolean;
    };

export interface AttestationInput {
  /** The Pyth `solana` message that travelled with the order, if any. */
  price?: Uint8Array;
}

/**
 * Reports what can currently be said about the attached price.
 *
 * Today: nothing. The parser and the signature check are not written, so an
 * attached blob is unverifiable rather than trusted.
 */
export function checkAttestation({ price }: AttestationInput): AttestationStatus {
  if (!price || price.length === 0) {
    return {
      state: "absent",
      label: "No price attestation",
      detail:
        "This order arrived with no signed price. The vault cannot tell whether the amounts reflect the market.",
    };
  }

  if (!VERIFIER_IMPLEMENTED) {
    return {
      state: "unverifiable",
      label: "Price attestation not verified",
      detail:
        `An attestation of ${price.length} bytes is attached, but the vault cannot check its ` +
        "signature yet. Treat the amounts as unverified: anything can attach bytes.",
    };
  }

  // Unreachable until the verifier lands; kept so the shape is visible.
  return {
    state: "rejected",
    label: "Price attestation could not be read",
    detail: "The attached attestation is not a Pyth message this vault recognises.",
  };
}

/** Whether a status permits signing under the strict default. */
export function permitsSigning(status: AttestationStatus, strict: boolean): boolean {
  if (!strict) return status.state !== "rejected";
  return status.state === "verified" && status.deviation <= MAX_DEVIATION;
}
