/**
 * Vault key material: generation, encryption at rest, Paper-Vault backup and
 * Ed25519 signing.
 *
 * Two rules govern everything here, both from docs/THREAT-MODEL.md:
 *
 *  - the decrypted seed exists only in memory, and is zeroed as soon as the
 *    signature is out. `unlock` hands you a buffer you are expected to
 *    `wipe()`; `signWith` does it for you.
 *  - nothing in this package performs I/O. Argon2id comes from hash-wasm,
 *    which inlines its WebAssembly as base64 rather than fetching a module,
 *    so the vault's `connect-src 'none'` holds.
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import { argon2id } from "hash-wasm";
import {
  BLOB_VERSION,
  NONCE_BYTES,
  SALT_BYTES,
  type KdfParams,
  type VaultBlob,
} from "./blob.js";

export {
  BLOB_BYTES,
  BLOB_VERSION,
  CIPHERTEXT_BYTES,
  NONCE_BYTES,
  PAPER_VAULT_MAGIC,
  PUBLIC_KEY_BYTES,
  SALT_BYTES,
  decodePaperVault,
  deserializeBlob,
  encodePaperVault,
  serializeBlob,
  type KdfParams,
  type VaultBlob,
} from "./blob.js";

export const SEED_BYTES = 32;
export const SIGNATURE_BYTES = 64;

/**
 * Argon2id cost: 3 passes over 64 MiB.
 *
 * Measured at ~180 ms on a development laptop (12 Sept 2026). A phone will be
 * several times slower, and the number that matters is the one from the
 * measurement day — if unlocking crosses roughly a second on the demo device,
 * lower `iterations` rather than `memoryKiB`: the memory is what costs an
 * attacker with a GPU.
 *
 * The parameters live in the blob, so raising them later leaves older backups
 * openable.
 */
export const DEFAULT_KDF: KdfParams = {
  alg: "argon2id",
  iterations: 3,
  memoryKiB: 64 * 1024,
  parallelism: 1,
};

export const MIN_PASSWORD_LENGTH = 12;

export interface GeneratedVault {
  publicKey: Uint8Array;
  /** Zero this with `wipe()` once it is locked. */
  seed: Uint8Array;
}

/** Overwrites a buffer in place. Call it on every seed you stop needing. */
export function wipe(bytes: Uint8Array): void {
  bytes.fill(0);
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function generateVault(): GeneratedVault {
  const seed = randomBytes(SEED_BYTES);
  return { publicKey: ed25519.getPublicKey(seed), seed };
}

async function deriveKey(password: string, salt: Uint8Array, kdf: KdfParams): Promise<CryptoKey> {
  const raw = await argon2id({
    password,
    salt,
    iterations: kdf.iterations,
    memorySize: kdf.memoryKiB,
    parallelism: kdf.parallelism,
    hashLength: 32,
    outputType: "binary",
  });

  const key = await crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  wipe(raw);
  return key;
}

/** Encrypts a seed under a master password. */
export async function lock(
  seed: Uint8Array,
  password: string,
  kdf: KdfParams = DEFAULT_KDF
): Promise<VaultBlob> {
  if (seed.length !== SEED_BYTES) {
    throw new Error(`vault-crypto: a seed is ${SEED_BYTES} bytes, got ${seed.length}`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`vault-crypto: the master password needs ${MIN_PASSWORD_LENGTH} characters`);
  }

  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const key = await deriveKey(password, salt, kdf);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, seed as BufferSource)
  );

  return {
    version: BLOB_VERSION,
    kdf,
    salt,
    nonce,
    ciphertext,
    publicKey: ed25519.getPublicKey(seed),
    createdAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Decrypts a seed. Throws on a wrong password — GCM authenticates, so a bad
 * key is a failed tag check, never silently wrong bytes.
 *
 * The returned seed is live key material: wipe it.
 */
export async function unlock(blob: VaultBlob, password: string): Promise<Uint8Array> {
  const key = await deriveKey(password, blob.salt, blob.kdf);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: blob.nonce as BufferSource },
      key,
      blob.ciphertext as BufferSource
    );
  } catch {
    throw new Error("vault-crypto: wrong password");
  }

  const seed = new Uint8Array(plaintext);
  const publicKey = ed25519.getPublicKey(seed);
  if (!publicKey.every((byte, i) => byte === blob.publicKey[i])) {
    wipe(seed);
    throw new Error("vault-crypto: the blob's public key does not match its seed");
  }

  return seed;
}

/** Ed25519 signature over a serialized Solana message. */
export function sign(message: Uint8Array, seed: Uint8Array): Uint8Array {
  if (seed.length !== SEED_BYTES) {
    throw new Error(`vault-crypto: a seed is ${SEED_BYTES} bytes, got ${seed.length}`);
  }
  return ed25519.sign(message, seed);
}

export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  return ed25519.verify(signature, message, publicKey);
}

/**
 * Unlock, sign, wipe — the only path the vault's signing screen should use.
 * The seed never outlives the signature.
 */
export async function signWith(
  blob: VaultBlob,
  password: string,
  message: Uint8Array
): Promise<Uint8Array> {
  const seed = await unlock(blob, password);
  try {
    return sign(message, seed);
  } finally {
    wipe(seed);
  }
}
