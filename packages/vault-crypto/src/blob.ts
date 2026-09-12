/**
 * The encrypted vault blob, and its printable Paper-Vault form.
 *
 * Layout is explicit and versioned so a backup printed today still opens in a
 * year. Everything needed to decrypt is inside — including the KDF cost
 * parameters, which is why raising them later does not orphan old backups.
 */

import { toBase45, fromBase45 } from "@pixstock/agqp";

export const PAPER_VAULT_MAGIC = "PVLT";
export const BLOB_VERSION = 1;

export const SALT_BYTES = 16;
export const NONCE_BYTES = 12;
/** 32-byte seed plus the 16-byte GCM tag. */
export const CIPHERTEXT_BYTES = 48;
export const PUBLIC_KEY_BYTES = 32;

export interface KdfParams {
  alg: "argon2id";
  iterations: number;
  memoryKiB: number;
  parallelism: number;
}

export interface VaultBlob {
  version: number;
  kdf: KdfParams;
  salt: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  publicKey: Uint8Array;
  /** Unix seconds. Shown on the printed sheet so the holder can tell copies apart. */
  createdAt: number;
}

/**
 * Binary layout, little-endian:
 *
 * | 0 | version u8 | 1 | kdf alg u8 (1 = argon2id) |
 * | 2..5 | iterations u32 | 6..9 | memory KiB u32 | 10 | parallelism u8 |
 * | 11..26 | salt | 27..38 | nonce | 39..86 | ciphertext |
 * | 87..118 | public key | 119..126 | created u64 |
 */
const OFFSETS = {
  version: 0,
  kdfAlg: 1,
  iterations: 2,
  memoryKiB: 6,
  parallelism: 10,
  salt: 11,
  nonce: 11 + SALT_BYTES,
  ciphertext: 11 + SALT_BYTES + NONCE_BYTES,
  publicKey: 11 + SALT_BYTES + NONCE_BYTES + CIPHERTEXT_BYTES,
  createdAt: 11 + SALT_BYTES + NONCE_BYTES + CIPHERTEXT_BYTES + PUBLIC_KEY_BYTES,
} as const;

export const BLOB_BYTES = OFFSETS.createdAt + 8;

const KDF_ALG_ARGON2ID = 1;

export function serializeBlob(blob: VaultBlob): Uint8Array {
  if (blob.salt.length !== SALT_BYTES) throw new Error("vault-crypto: bad salt length");
  if (blob.nonce.length !== NONCE_BYTES) throw new Error("vault-crypto: bad nonce length");
  if (blob.ciphertext.length !== CIPHERTEXT_BYTES) {
    throw new Error("vault-crypto: bad ciphertext length");
  }
  if (blob.publicKey.length !== PUBLIC_KEY_BYTES) {
    throw new Error("vault-crypto: bad public key length");
  }

  const out = new Uint8Array(BLOB_BYTES);
  const view = new DataView(out.buffer);

  out[OFFSETS.version] = blob.version;
  out[OFFSETS.kdfAlg] = KDF_ALG_ARGON2ID;
  view.setUint32(OFFSETS.iterations, blob.kdf.iterations, true);
  view.setUint32(OFFSETS.memoryKiB, blob.kdf.memoryKiB, true);
  out[OFFSETS.parallelism] = blob.kdf.parallelism;
  out.set(blob.salt, OFFSETS.salt);
  out.set(blob.nonce, OFFSETS.nonce);
  out.set(blob.ciphertext, OFFSETS.ciphertext);
  out.set(blob.publicKey, OFFSETS.publicKey);
  view.setBigUint64(OFFSETS.createdAt, BigInt(blob.createdAt), true);

  return out;
}

export function deserializeBlob(bytes: Uint8Array): VaultBlob {
  if (bytes.length !== BLOB_BYTES) {
    throw new Error(`vault-crypto: expected ${BLOB_BYTES} bytes, got ${bytes.length}`);
  }

  const version = bytes[OFFSETS.version]!;
  if (version !== BLOB_VERSION) {
    throw new Error(`vault-crypto: unsupported vault version ${version}`);
  }
  if (bytes[OFFSETS.kdfAlg] !== KDF_ALG_ARGON2ID) {
    throw new Error(`vault-crypto: unsupported kdf ${bytes[OFFSETS.kdfAlg]}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return {
    version,
    kdf: {
      alg: "argon2id",
      iterations: view.getUint32(OFFSETS.iterations, true),
      memoryKiB: view.getUint32(OFFSETS.memoryKiB, true),
      parallelism: bytes[OFFSETS.parallelism]!,
    },
    salt: bytes.slice(OFFSETS.salt, OFFSETS.nonce),
    nonce: bytes.slice(OFFSETS.nonce, OFFSETS.ciphertext),
    ciphertext: bytes.slice(OFFSETS.ciphertext, OFFSETS.publicKey),
    publicKey: bytes.slice(OFFSETS.publicKey, OFFSETS.createdAt),
    createdAt: Number(view.getBigUint64(OFFSETS.createdAt, true)),
  };
}

/**
 * The string printed as a QR code. Base45 keeps it in QR alphanumeric mode,
 * so the sheet stays small enough to scan from paper.
 */
export function encodePaperVault(blob: VaultBlob): string {
  return `${PAPER_VAULT_MAGIC}:${toBase45(serializeBlob(blob))}`;
}

export function decodePaperVault(text: string): VaultBlob {
  const trimmed = text.trim();
  if (!trimmed.startsWith(`${PAPER_VAULT_MAGIC}:`)) {
    throw new Error("vault-crypto: this is not a Paper-Vault code");
  }
  return deserializeBlob(fromBase45(trimmed.slice(PAPER_VAULT_MAGIC.length + 1)));
}
