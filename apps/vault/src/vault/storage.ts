import {
  deserializeBlob,
  serializeBlob,
  type VaultBlob,
} from "@pixstock/vault-crypto";

/**
 * Where the encrypted vault lives between sessions.
 *
 * localStorage rather than IndexedDB: the blob is 127 bytes, and a synchronous
 * read keeps the startup path trivial. What is stored is ciphertext under the
 * master password — the device holding it learns nothing.
 */
const KEY = "pixstock.vault.v1";

export function loadBlob(): VaultBlob | null {
  const stored = localStorage.getItem(KEY);
  if (!stored) return null;

  try {
    return deserializeBlob(Uint8Array.from(atob(stored), (c) => c.charCodeAt(0)));
  } catch {
    // A blob we cannot parse is a blob we cannot open. Say so rather than
    // silently offering to create a second vault over the top of it.
    throw new Error("The stored vault is unreadable. Restore it from your Paper-Vault.");
  }
}

export function saveBlob(blob: VaultBlob): void {
  const bytes = serializeBlob(blob);
  localStorage.setItem(KEY, btoa(String.fromCharCode(...bytes)));
}

export function clearBlob(): void {
  localStorage.removeItem(KEY);
}
