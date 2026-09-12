/**
 * Vault key material: generation, at-rest encryption, Paper-Vault export and
 * Ed25519 signing.
 *
 * The decrypted seed lives in memory only, and is zeroed (`fill(0)`) as soon
 * as the signature is produced. Nothing here ever touches the network.
 */

export interface VaultBlob {
  /** AES-GCM-256 ciphertext of the seed. */
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  /** Argon2id parameters, stored so an older blob stays openable. */
  kdf: { algorithm: "argon2id"; iterations: number; memoryKiB: number; parallelism: number };
}

export interface GeneratedVault {
  publicKey: Uint8Array;
  seed: Uint8Array;
}

export function generateVault(): GeneratedVault {
  throw new Error("vault-crypto: generateVault is not implemented yet");
}

export function lock(_seed: Uint8Array, _password: string): Promise<VaultBlob> {
  throw new Error("vault-crypto: lock is not implemented yet");
}

export function unlock(_blob: VaultBlob, _password: string): Promise<Uint8Array> {
  throw new Error("vault-crypto: unlock is not implemented yet");
}

/** Encodes a locked vault as the printable Paper-Vault QR payload. */
export function encodePaperVault(_blob: VaultBlob): string {
  throw new Error("vault-crypto: encodePaperVault is not implemented yet");
}

export function decodePaperVault(_text: string): VaultBlob {
  throw new Error("vault-crypto: decodePaperVault is not implemented yet");
}

/** Ed25519 signature over a serialized Solana message. */
export function sign(_message: Uint8Array, _seed: Uint8Array): Uint8Array {
  throw new Error("vault-crypto: sign is not implemented yet");
}
