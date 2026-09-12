"use client";

import { isVaultAddress } from "@/lib/vault";

/** Where orders are sent. A public key: this browser never holds a secret. */
export function VaultField({
  vault,
  onChange,
}: {
  vault: string;
  onChange: (value: string) => void;
}) {
  const invalid = vault.length > 0 && !isVaultAddress(vault);

  return (
    <label className="field-block">
      <span className="eyebrow">Your vault</span>
      <input
        className="input mono-input"
        value={vault}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder="Paste the public key shown on your vault"
        spellCheck={false}
        autoComplete="off"
      />
      {invalid ? (
        <small className="alert-inline">That is not a Solana address.</small>
      ) : (
        <small className="muted">
          A public key. Nothing that can sign ever reaches this page.
        </small>
      )}
    </label>
  );
}
