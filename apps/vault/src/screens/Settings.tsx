import { useEffect, useState } from "react";
import { base58 } from "@scure/base";
import { encodePaperVault, unlock, wipe as wipeBytes, type VaultBlob } from "@pixstock/vault-crypto";
import { QrCode } from "../components/QrCode";
import { SIGNERS_READ_AT, TRUSTED_SIGNERS } from "@pixstock/pyth-verify";
import { clearBlob } from "../vault/storage";
import { forgetCredential, storedCredential } from "../vault/biometric";
import { DEVIATION_CHOICES, loadSettings, saveSettings } from "../vault/settings";

/**
 * What this vault is, what it will refuse, how to back it up, and how to
 * erase it.
 *
 * The price tolerance can only be tightened — see vault/settings.ts. Erasing
 * asks twice and says exactly what is lost, because the Paper-Vault is the
 * only thing that brings it back and there is no support desk that can.
 *
 * The Paper-Vault is shown on demand rather than only at setup. It is the
 * encrypted blob: rendering it needs no password and reveals nothing to
 * anyone who does not have one, so there was never a reason to show it once
 * and never again — while the reason to show it again is that a backup you
 * cannot re-take is a backup you have already lost.
 */
export function Settings({ blob, onDone }: { blob: VaultBlob; onDone: () => void }) {
  const [settings, setSettings] = useState(loadSettings);
  const [confirming, setConfirming] = useState(false);
  const [wiped, setWiped] = useState(false);
  const [paper, setPaper] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [keyPassword, setKeyPassword] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  // A revealed key does not stay on screen. Sixty seconds is long enough to
  // copy it into a wallet and short enough that a phone left face up on a
  // table stops being a key.
  useEffect(() => {
    if (!secret) return;
    const timer = setTimeout(() => setSecret(null), 60_000);
    return () => clearTimeout(timer);
  }, [secret]);

  /**
   * Decrypts the seed and renders it in the form other wallets import.
   *
   * The master password is asked for again even when a fingerprint is
   * enrolled. Biometrics authorise a signature the holder is watching happen;
   * handing over the account itself is a different act and deserves the
   * thing only the holder knows.
   *
   * `unlock` has already checked that the seed derives the blob's public key,
   * so appending it is sound rather than convenient: Solana's secret key is
   * the seed followed by the public key.
   *
   * The seed buffer is wiped immediately. The base58 string that replaces it
   * cannot be — JavaScript strings are immutable and freed whenever the
   * collector decides — which is the honest cost of this screen existing, and
   * why it hides itself again.
   */
  async function reveal() {
    setKeyError(null);

    let seed: Uint8Array | null = null;
    try {
      seed = await unlock(blob, keyPassword);
      const secretKey = new Uint8Array(64);
      secretKey.set(seed, 0);
      secretKey.set(blob.publicKey, 32);
      setSecret(base58.encode(secretKey));
      secretKey.fill(0);
      setAsking(false);
      setKeyPassword("");
    } catch (err) {
      setKeyError((err as Error).message);
    } finally {
      if (seed) wipeBytes(seed);
    }
  }

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
        <h3>Back this vault up</h3>
        <p className="muted">
          The same Paper-Vault you were shown when this vault was made. It is encrypted
          with your master password, so a photograph of it spends nothing on its own.
          Print it, or read it into a wallet that takes a private key.
        </p>
        {paper ? (
          <>
            <QrCode text={paper} px={280} />
            <p
              className="num"
              style={{ wordBreak: "break-all", fontSize: 12, lineHeight: 1.5 }}
            >
              {paper}
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={() => setPaper(null)}>
                Hide it
              </button>
            </div>
          </>
        ) : (
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => setPaper(encodePaperVault(blob))}
            >
              Show my Paper-Vault
            </button>
          </div>
        )}
      </div>

      <div className="stack stack--tight">
        <h3>Show my private key</h3>
        <p className="muted">
          The account itself, in the form Phantom, Solflare and solana-keygen import.
          Anyone who reads it can move everything here — no password, no second step, no
          way to take it back. The Paper-Vault above is the safer backup: it is useless
          without your master password.
        </p>

        {secret ? (
          <>
            <div className="alert" role="alert">
              <strong>This is your account. It hides itself in a minute.</strong>
            </div>
            <p
              className="num"
              style={{ wordBreak: "break-all", fontSize: 13, lineHeight: 1.6 }}
            >
              {secret}
            </p>
            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => void navigator.clipboard?.writeText(secret)}
              >
                Copy
              </button>
              <button type="button" className="btn btn--solid" onClick={() => setSecret(null)}>
                Hide it
              </button>
            </div>
          </>
        ) : asking ? (
          <div className="stack stack--tight">
            <label className="stack stack--tight">
              <span>Master password</span>
              <input
                type="password"
                value={keyPassword}
                onChange={(event) => setKeyPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && keyPassword.length > 0) void reveal();
                }}
                autoComplete="current-password"
                autoFocus
              />
            </label>
            {keyError && (
              <p className="alert-inline" role="alert">
                {keyError}
              </p>
            )}
            <div className="row">
              <button
                type="button"
                className="btn btn--solid"
                disabled={keyPassword.length === 0}
                onClick={() => void reveal()}
              >
                Show it
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setAsking(false);
                  setKeyPassword("");
                  setKeyError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn" onClick={() => setAsking(true)}>
              Show my private key
            </button>
          </div>
        )}
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
