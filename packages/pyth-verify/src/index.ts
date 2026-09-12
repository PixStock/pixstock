/**
 * Offline verification of a Pyth Pro (ex-Lazer) price message.
 *
 * This is the differentiator: the vault checks the market price against an
 * Ed25519 signature it can verify with no network, and refuses to sign when
 * the relayer's numbers drift from the oracle's.
 */

export interface PythPriceUpdate {
  feedId: number;
  price: bigint;
  exponent: number;
  confidence: bigint;
  /** Unix seconds. */
  publishTime: number;
}

export interface PythMessage {
  updates: PythPriceUpdate[];
  signer: Uint8Array;
  signature: Uint8Array;
  payload: Uint8Array;
}

export interface TrustedSigner {
  publicKey: Uint8Array;
  /** Unix seconds. A signer past its expiry is rejected. */
  expiresAt: number;
}

export type VerifyResult =
  | { ok: true; message: PythMessage }
  | { ok: false; reason: "bad-signature" | "unknown-signer" | "signer-expired" | "stale" };

export function parseSolanaMessage(_bytes: Uint8Array): PythMessage {
  throw new Error("pyth-verify: parseSolanaMessage is not implemented yet");
}

export function verify(
  _message: PythMessage,
  _trustedSigners: readonly TrustedSigner[],
  _now: number
): VerifyResult {
  throw new Error("pyth-verify: verify is not implemented yet");
}

/** Price implied by an order leg, for comparison against the oracle. */
export function impliedPrice(_inAmount: bigint, _outAmount: bigint, _decimalsDelta: number): number {
  throw new Error("pyth-verify: impliedPrice is not implemented yet");
}

/** Signed relative deviation, e.g. 0.012 for +1.2%. */
export function deviation(implied: number, oracle: number): number {
  return (implied - oracle) / oracle;
}
