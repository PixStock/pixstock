import { MAX_DEVIATION } from "@pixstock/pyth-verify";

/**
 * The few choices a holder gets, and the one they do not.
 *
 * The price tolerance can only be made *stricter* than the built-in one. That
 * asymmetry is the whole design: a setting that can be loosened is a setting
 * an attacker talks someone into loosening, and the number that protects a
 * holder should not be adjustable by whoever is trying to get past it. So
 * this file can tighten 1% to 0.5%, and nothing here can widen it.
 */
const KEY = "pixstock.vault.settings.v1";

export interface VaultSettings {
  /** Absolute deviation above which the vault refuses. Never above MAX_DEVIATION. */
  maxDeviation: number;
}

export const DEVIATION_CHOICES = [0.005, MAX_DEVIATION] as const;

export const DEFAULT_SETTINGS: VaultSettings = { maxDeviation: MAX_DEVIATION };

export function loadSettings(): VaultSettings {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(stored) as Partial<VaultSettings>;
    const chosen = Number(parsed.maxDeviation);

    // A stored value that is not one of the offered choices — corrupted, or
    // edited by hand to something permissive — falls back to the strictest
    // reading, never to the loosest.
    if (!Number.isFinite(chosen) || chosen <= 0) return DEFAULT_SETTINGS;
    return { maxDeviation: Math.min(chosen, MAX_DEVIATION) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: VaultSettings): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ maxDeviation: Math.min(settings.maxDeviation, MAX_DEVIATION) }),
    );
  } catch {
    // Storage refused. The default stands, which is the safe one.
  }
}
