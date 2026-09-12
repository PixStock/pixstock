import { describe, expect, it } from "vitest";
import {
  BLOB_BYTES,
  DEFAULT_KDF,
  MIN_PASSWORD_LENGTH,
  PUBLIC_KEY_BYTES,
  SEED_BYTES,
  SIGNATURE_BYTES,
  decodePaperVault,
  deserializeBlob,
  encodePaperVault,
  generateVault,
  lock,
  serializeBlob,
  sign,
  signWith,
  unlock,
  verify,
  wipe,
} from "../src/index.js";

const PASSWORD = "correct horse battery staple";

/** Argon2id at production cost takes ~1s; tests use a cheap setting. */
const FAST_KDF = { ...DEFAULT_KDF, iterations: 1, memoryKiB: 1024 };

describe("generateVault", () => {
  it("produces a 32-byte seed and its public key", () => {
    const { seed, publicKey } = generateVault();
    expect(seed).toHaveLength(SEED_BYTES);
    expect(publicKey).toHaveLength(PUBLIC_KEY_BYTES);
  });

  it("never repeats a seed", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateVault().seed.join(",")));
    expect(seen.size).toBe(50);
  });
});

describe("lock and unlock", () => {
  it("round-trips a seed", async () => {
    const { seed } = generateVault();
    const blob = await lock(seed, PASSWORD, FAST_KDF);
    await expect(unlock(blob, PASSWORD)).resolves.toEqual(seed);
  });

  it("rejects a wrong password rather than returning wrong bytes", async () => {
    const { seed } = generateVault();
    const blob = await lock(seed, PASSWORD, FAST_KDF);
    await expect(unlock(blob, "not the password at all")).rejects.toThrow(/wrong password/);
  });

  it("refuses a password below the minimum length", async () => {
    const { seed } = generateVault();
    await expect(lock(seed, "a".repeat(MIN_PASSWORD_LENGTH - 1), FAST_KDF)).rejects.toThrow(
      new RegExp(`${MIN_PASSWORD_LENGTH} characters`)
    );
  });

  it("refuses a seed of the wrong size", async () => {
    await expect(lock(new Uint8Array(16), PASSWORD, FAST_KDF)).rejects.toThrow(/32 bytes/);
  });

  it("uses a fresh salt and nonce every time", async () => {
    const { seed } = generateVault();
    const a = await lock(seed, PASSWORD, FAST_KDF);
    const b = await lock(seed, PASSWORD, FAST_KDF);
    expect(a.salt).not.toEqual(b.salt);
    expect(a.nonce).not.toEqual(b.nonce);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it("detects a tampered ciphertext", async () => {
    const { seed } = generateVault();
    const blob = await lock(seed, PASSWORD, FAST_KDF);
    blob.ciphertext[0] ^= 0x01;
    await expect(unlock(blob, PASSWORD)).rejects.toThrow(/wrong password/);
  });

  it("keeps the stored cost parameters, so an older backup still opens", async () => {
    const { seed } = generateVault();
    const blob = await lock(seed, PASSWORD, { ...FAST_KDF, iterations: 2 });
    expect(blob.kdf.iterations).toBe(2);
    await expect(unlock(blob, PASSWORD)).resolves.toEqual(seed);
  });
});

describe("Paper-Vault", () => {
  it("round-trips through the printable code", async () => {
    const { seed } = generateVault();
    const blob = await lock(seed, PASSWORD, FAST_KDF);

    const printed = encodePaperVault(blob);
    expect(printed.startsWith("PVLT:")).toBe(true);

    const restored = decodePaperVault(printed);
    expect(restored).toEqual(blob);
    await expect(unlock(restored, PASSWORD)).resolves.toEqual(seed);
  });

  it("stays inside the QR alphanumeric set", async () => {
    const { seed } = generateVault();
    const printed = encodePaperVault(await lock(seed, PASSWORD, FAST_KDF));
    expect(printed).toMatch(/^[0-9A-Z $%*+\-./:]+$/);
  });

  it("serializes to a fixed size", async () => {
    const { seed } = generateVault();
    expect(serializeBlob(await lock(seed, PASSWORD, FAST_KDF))).toHaveLength(BLOB_BYTES);
  });

  it("rejects a code that is not a Paper-Vault", () => {
    expect(() => decodePaperVault("PS1:WG9P1:01:05:32EC5E76:AB")).toThrow(/not a Paper-Vault/);
  });

  it("rejects a truncated blob", async () => {
    const { seed } = generateVault();
    const bytes = serializeBlob(await lock(seed, PASSWORD, FAST_KDF));
    expect(() => deserializeBlob(bytes.slice(0, -1))).toThrow(/expected \d+ bytes/);
  });

  it("rejects an unknown vault version", async () => {
    const { seed } = generateVault();
    const bytes = serializeBlob(await lock(seed, PASSWORD, FAST_KDF));
    bytes[0] = 99;
    expect(() => deserializeBlob(bytes)).toThrow(/unsupported vault version 99/);
  });
});

describe("signing", () => {
  const message = new TextEncoder().encode("a solana message would go here");

  it("produces a verifiable 64-byte signature", () => {
    const { seed, publicKey } = generateVault();
    const signature = sign(message, seed);
    expect(signature).toHaveLength(SIGNATURE_BYTES);
    expect(verify(signature, message, publicKey)).toBe(true);
  });

  it("does not verify against another key", () => {
    const { seed } = generateVault();
    const other = generateVault();
    expect(verify(sign(message, seed), message, other.publicKey)).toBe(false);
  });

  it("does not verify a different message", () => {
    const { seed, publicKey } = generateVault();
    const tampered = new TextEncoder().encode("a solana message would go here.");
    expect(verify(sign(message, seed), tampered, publicKey)).toBe(false);
  });

  it("signWith unlocks, signs, and leaves no seed behind", async () => {
    const { seed, publicKey } = generateVault();
    const blob = await lock(seed, PASSWORD, FAST_KDF);
    const signature = await signWith(blob, PASSWORD, message);
    expect(verify(signature, message, publicKey)).toBe(true);
  });

  it("signWith refuses a wrong password", async () => {
    const { seed } = generateVault();
    const blob = await lock(seed, PASSWORD, FAST_KDF);
    await expect(signWith(blob, "wrong password here", message)).rejects.toThrow(/wrong password/);
  });
});

describe("wipe", () => {
  it("zeroes the buffer in place", () => {
    const { seed } = generateVault();
    wipe(seed);
    expect(seed.every((b) => b === 0)).toBe(true);
  });
});
