"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "pixstock.pairedVault";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Same-tab writes do not raise a storage event, so we raise our own. */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    removeEventListener("storage", listener);
  };
}

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    // Private browsing, or storage turned off. The field simply starts empty.
    return "";
  }
}

/**
 * Which vault this browser sends orders to.
 *
 * A public key and nothing else — the browser never holds anything that can
 * sign. Typed in for now; scanning the vault's pairing code will fill it in
 * once the pairing screen reads a PAIR payload.
 *
 * Read through `useSyncExternalStore` rather than an effect: localStorage is
 * an external store, and setting state from an effect on mount is what the
 * React compiler warns about.
 */
export function usePairedVault() {
  const vault = useSyncExternalStore(subscribe, read, () => "");

  const setVault = useCallback((next: string) => {
    try {
      if (next) localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch {
      // Remembering is a convenience, not a requirement.
    }
    for (const listener of listeners) listener();
  }, []);

  return { vault, setVault, isValid: BASE58.test(vault) };
}

export const isVaultAddress = (value: string) => BASE58.test(value);
