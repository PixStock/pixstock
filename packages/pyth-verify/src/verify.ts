/**
 * Deciding whether to believe a price, with no network.
 *
 * Four questions, in this order, because each one is cheap and each one makes
 * the next meaningful: are these bytes a Pyth message, is the signature real,
 * is the key one Pyth published and still current, and is the price recent
 * enough to mean anything.
 *
 * A "no" at any step is a refusal with a reason. There is no partial credit:
 * the whole point of this package is that the vault says "verified" only when
 * it is, and a compromised relayer can attach any bytes it likes.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  MalformedMessage,
  parsePayload,
  parseSolanaMessage,
  type PayloadData,
  type SolanaMessage,
} from "./message.js";
import { findSigner, TRUSTED_SIGNERS, type TrustedSigner } from "./signers.js";

/** A price older than this is stale, whatever it says. */
export const MAX_AGE_SECONDS = 120;

export type VerifyFailure =
  | "malformed"
  | "bad-signature"
  | "unknown-signer"
  | "signer-expired"
  | "stale"
  | "from-the-future";

export type VerifyResult =
  | { ok: true; message: SolanaMessage; payload: PayloadData; signer: TrustedSigner; ageSeconds: number }
  | { ok: false; reason: VerifyFailure; detail: string };

export interface VerifyOptions {
  /** Unix seconds. On a phone in airplane mode this is the device's own clock. */
  now: number;
  signers?: readonly TrustedSigner[];
  maxAgeSeconds?: number;
}

export function verify(bytes: Uint8Array, options: VerifyOptions): VerifyResult {
  const { now, signers = TRUSTED_SIGNERS, maxAgeSeconds = MAX_AGE_SECONDS } = options;

  let message: SolanaMessage;
  let payload: PayloadData;
  try {
    message = parseSolanaMessage(bytes);
    payload = parsePayload(message.payload);
  } catch (err) {
    return {
      ok: false,
      reason: "malformed",
      detail: err instanceof MalformedMessage ? err.message : (err as Error).message,
    };
  }

  // The signature first: everything after this reads fields, and reading
  // fields off an unsigned blob is how a checker becomes a rubber stamp.
  let valid: boolean;
  try {
    valid = ed25519.verify(message.signature, message.payload, message.publicKey);
  } catch (err) {
    return { ok: false, reason: "bad-signature", detail: (err as Error).message };
  }
  if (!valid) {
    return {
      ok: false,
      reason: "bad-signature",
      detail: "The signature does not match these bytes.",
    };
  }

  const signer = findSigner(message.publicKey, signers);
  if (!signer) {
    return {
      ok: false,
      reason: "unknown-signer",
      detail:
        "Signed by a key this vault was not built to trust. A valid signature by the wrong " +
        "key is exactly what a forged price looks like.",
    };
  }
  if (signer.expiresAt <= now) {
    return {
      ok: false,
      reason: "signer-expired",
      detail: `Pyth's signing key expired on ${new Date(signer.expiresAt * 1000)
        .toISOString()
        .slice(0, 10)}.`,
    };
  }

  const ageSeconds = now - Number(payload.timestampUs / 1_000_000n);
  if (ageSeconds > maxAgeSeconds) {
    return {
      ok: false,
      reason: "stale",
      detail: `This price is ${formatAge(ageSeconds)} old. Prices move; this one is no longer evidence of anything.`,
    };
  }
  if (ageSeconds < -maxAgeSeconds) {
    // Either the message is fabricated or this phone's clock is wrong. Both
    // are reasons to stop, and the holder is told which one it might be.
    return {
      ok: false,
      reason: "from-the-future",
      detail:
        `This price is dated ${formatAge(-ageSeconds)} in the future. Either it is not genuine, ` +
        "or this phone's clock is wrong — check the date before signing anything.",
    };
  }

  return { ok: true, message, payload, signer, ageSeconds };
}

function formatAge(seconds: number): string {
  const whole = Math.round(Math.abs(seconds));
  if (whole < 60) return `${whole} seconds`;
  if (whole < 3600) return `${Math.round(whole / 60)} minutes`;
  if (whole < 86_400) return `${Math.round(whole / 3600)} hours`;
  return `${Math.round(whole / 86_400)} days`;
}
