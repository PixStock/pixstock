/**
 * The keys whose price messages this vault will accept.
 *
 * A device in airplane mode cannot ask who is allowed to sign a price, so the
 * answer travels with the build. It is not ours to invent: Pyth publishes it
 * on chain, in the `Storage` account of its Solana contract, each key with an
 * expiry. What follows was read from mainnet and can be read again by anyone:
 *
 *   node scripts/read-pyth-signers.mjs
 *
 * If that prints a key this file does not list, this file is out of date and
 * the vault will refuse prices signed by the new key — which is the correct
 * failure. The opposite mistake, accepting a key Pyth has rotated away, is the
 * one that costs money, so expiry is enforced rather than assumed.
 */
import { base58 } from "@scure/base";

export interface TrustedSigner {
  /** Ed25519 public key, 32 bytes. */
  publicKey: Uint8Array;
  /** Base58, as Pyth publishes it. Shown on screen when a signer is unknown. */
  address: string;
  /** Unix seconds. A signer past its expiry is rejected. */
  expiresAt: number;
}

/** Pyth Lazer (Pyth Pro) on Solana mainnet. */
export const PYTH_PROGRAM = "pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt";
/** The `Storage` PDA, seed "storage", of that program. */
export const PYTH_STORAGE = "3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL";

/** When the list below was read from the chain. */
export const SIGNERS_READ_AT = "2026-09-13T14:34:29Z";

const PUBLISHED: ReadonlyArray<{ address: string; expiresAt: number }> = [
  // Read 13 Sept 2026 from 3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL.
  { address: "9gKEEcFzSd1PDYBKWAKZi4Sq4ZCUaVX5oTr8kEjdwsfR", expiresAt: 2_052_483_257 },
];

export const TRUSTED_SIGNERS: readonly TrustedSigner[] = PUBLISHED.map((signer) => ({
  address: signer.address,
  expiresAt: signer.expiresAt,
  publicKey: base58.decode(signer.address),
}));

/** The signer for a key, or undefined if this build has never heard of it. */
export function findSigner(
  publicKey: Uint8Array,
  signers: readonly TrustedSigner[] = TRUSTED_SIGNERS,
): TrustedSigner | undefined {
  return signers.find(
    (signer) =>
      signer.publicKey.length === publicKey.length &&
      signer.publicKey.every((byte, i) => byte === publicKey[i]),
  );
}
