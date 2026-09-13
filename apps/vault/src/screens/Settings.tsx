import { useState } from "react";
import { base58 } from "@scure/base";
import type { VaultBlob } from "@pixstock/vault-crypto";
import { SIGNERS_READ_AT, TRUSTED_SIGNERS } from "@pixstock/pyth-verify";
import { clearBlob } from "../vault/storage";
import { forgetCredential, storedCredential } from "../vault/biometric";
import { DEVIATION_CHOICES, loadSettings, saveSettings } from "../vault/settings";

/**
 * What this vault is, what it will refuse, and how to erase it.
 *
 * The price tolerance can only be tightened — see vault/settings.ts. Erasing
 * asks twice and says exactly what is lost, because the Paper-Vault is the
 * only thing that brings it back and there is no support desk that can.
 */
export function Settings({ blob, onDone }: { blob: VaultBlob; onDone: () => void }) {
  const [settings, setSettings] = useState(loadSettings);
  const [confirming, setConfirming] = useState(false);
  const [wiped, setWiped] = useState(false);

  const vault = base58.encode(blob.publicKey);
  const biometric = storedCredential() !== null;

  function choose(maxDeviation: number) {
    const next = { maxDeviation };
    setSettings(next);
    saveSettings(next);
  }

  function wipe() {
    clearBlob();
    forgetCredential();
    setWiped(true);
  }

  if (wiped) {
    return (
      <section className="stack">
        <div className="alert" role="alert">
          <strong>This vault is gone from this phone.</strong>
          <p style={{ margin: "6px 0 0" }}>
            Its key exists only on your Paper-Vault now. Reload the app to start again, or
            restore the sheet.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn--solid" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="stack">
      <header className="stack stack--tight">
        <p className="eyebrow">Settings</p>
        <h2>This vault</h2>
      </header>

      <dl className="ticket-meta">
        <div>
          <dt>Address</dt>
          <dd className="num" style={{ wordBreak: "break-all" }}>
            {vault}
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd className="num">{new Date(blob.createdAt * 1000).toISOString().slice(0, 10)}</dd>
        </div>
        <div>
          <dt>Biometric</dt>
          <dd>{biometric ? "enrolled on this phone" : "none — the password stands alone"}</dd>
        </div>
        <div>
          <dt>Pyth signing keys</dt>
          <dd>
            <span className="num">{TRUSTED_SIGNERS.length}</span>, read{" "}
            {SIGNERS_READ_AT.slice(0, 10)}
          </dd>
        </div>
      </dl>

      <div className="stack stack--tight">
        <h3>Refuse a price that drifts more than</h3>
        <p className="muted">
          This can be tightened, never loosened. The number that protects you should not be
          adjustable by whoever is trying to get past it.
        </p>
        <div className="row">
          {DEVIATION_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              className={`btn${settings.maxDeviation === choice ? " btn--solid" : ""}`}
              onClick={() => choose(choice)}
            >
              {(choice * 100).toFixed(1)}%
            </button>
          ))}
        </div>
      </div>

      <div className="stack stack--tight">
        <h3>Erase this vault</h3>
        <p className="muted">
          The encrypted key is deleted from this phone. Without your printed Paper-Vault it
          cannot be recovered — not by us, not by anyone.
        </p>
        <div className="row">
          {confirming ? (
            <>
              <button type="button" className="btn btn--solid" onClick={wipe}>
                Erase it. I have the paper.
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirming(true)}>
              Erase this vault
            </button>
          )}
        </div>
      </div>

      <div className="row">
        <button type="button" className="btn" onClick={onDone}>
          Back
        </button>
      </div>
    </section>
  );
}
