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
 * erase it — in four groups rather than one flat stack.
 *
 * The price tolerance can only be tightened — see vault/settings.ts. Erasing
 * asks twice and says exactly what is lost, because the Paper-Vault is the
 * only thing that brings it back and there is no support desk that can.
 *
 * The two backups open in place. A way out of your own vault that you have to
 * go somewhere to find is a way out nobody finds.
 */
export function Settings({ blob, onDone }: { blob: VaultBlob; onDone: () => void }) {
  const [settings, setSettings] = useState(loadSettings);
  const [confirming, setConfirming] = useState(false);
  const [wiped, setWiped] = useState(false);
  const [open, setOpen] = useState<"paper" | "key" | null>(null);
  const [paper, setPaper] = useState<string | null>(null);
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

  /** Closing a row puts away whatever it revealed. */
  function toggle(row: "paper" | "key") {
    setOpen((current) => {
      if (current === row) {
        if (row === "paper") setPaper(null);
        if (row === "key") {
          setSecret(null);
          setKeyPassword("");
          setKeyError(null);
        }
        return null;
      }
      return row;
    });
  }

  if (wiped) {
    return (
      <section className="stack">
        <div className="verdict verdict--crit" role="alert">
          <span className="verdict-badge" aria-hidden="true">
            ✕
          </span>
          <div className="verdict-body">
            <p className="verdict-head">This vault is gone from this phone.</p>
            <p className="verdict-detail">
              Its key exists only on your Paper-Vault now. Reload the app to start again, or
              restore the sheet.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--solid btn--wide"
          onClick={() => location.reload()}
        >
          Reload
        </button>
      </section>
    );
  }

  return (
    <section className="stack">
      <header className="stack stack--tight">
        <h2>Settings</h2>
      </header>

      <div className="idcard">
        <p className="eyebrow">This vault</p>
        <p className="addr">{vault}</p>
        <div className="chip-row">
          <span className={`chip${biometric ? " chip--ok" : ""}`}>
            {biometric && <span className="dot" aria-hidden="true" />}
            {biometric ? "Fingerprint on" : "No fingerprint"}
          </span>
          <span className="chip">Created {created(blob.createdAt)}</span>
          <span className="chip">
            <span className="num">{TRUSTED_SIGNERS.length}</span>&nbsp;Pyth keys
          </span>
        </div>
      </div>

      <div className="stack stack--tight">
        <h3>Refuse a price that drifts more than</h3>
        <p className="muted">
          This can be tightened, never loosened. The number that protects you should not be
          adjustable by whoever is trying to get past it.
        </p>
        <div className="choice-row">
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
        <p className="muted">Pyth keys read {SIGNERS_READ_AT.slice(0, 10)}.</p>
      </div>

      <div className="disclose">
        <button
          type="button"
          className="disclose-row"
          aria-expanded={open === "paper"}
          onClick={() => toggle("paper")}
        >
          <span className="t">
            <b>Show my Paper-Vault</b>
            <span>The encrypted sheet. Useless without your master password.</span>
          </span>
          <Chevron />
        </button>

        {open === "paper" && (
          <div className="disclose-body">
            <p className="muted">
              The same Paper-Vault you were shown when this vault was made. A photograph of
              it spends nothing on its own. Print it, or read it into a wallet that takes a
              private key.
            </p>
            {paper ? (
              <>
                <QrCode text={paper} px={480} className="qr qr--full" />
                <p className="num" style={{ wordBreak: "break-all", fontSize: 12, lineHeight: 1.5 }}>
                  {paper}
                </p>
              </>
            ) : (
              <div className="btn-pair">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPaper(encodePaperVault(blob))}
                >
                  Show it
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="disclose-row"
          aria-expanded={open === "key"}
          onClick={() => toggle("key")}
        >
          <span className="t">
            <b>Export to another wallet</b>
            <span>The private key itself. Anyone who reads it can move everything.</span>
          </span>
          <Chevron />
        </button>

        {open === "key" && (
          <div className="disclose-body">
            <p className="muted">
              The account itself, in the form Phantom, Solflare and solana-keygen import.
              Anyone who reads it can move everything here — no password, no second step, no
              way to take it back. The Paper-Vault above is the safer backup.
            </p>

            {secret ? (
              <>
                <div className="warnbox">
                  <span className="mark" aria-hidden="true">
                    !
                  </span>
                  <ul className="warnbox-list">
                    <li>This is your account. It hides itself in a minute.</li>
                  </ul>
                </div>
                <p className="num" style={{ wordBreak: "break-all", fontSize: 13, lineHeight: 1.6 }}>
                  {secret}
                </p>
                <div className="btn-pair">
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
            ) : (
              <>
                <label className="field field--tall">
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
                  <p className="alert" role="alert">
                    {keyError}
                  </p>
                )}
                <div className="btn-pair">
                  <button
                    type="button"
                    className="btn btn--solid"
                    disabled={keyPassword.length === 0}
                    onClick={() => void reveal()}
                  >
                    Show my private key
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="danger">
        <p className="eyebrow">Danger</p>
        <p>
          Erasing deletes the encrypted key from this phone. Without your printed
          Paper-Vault it cannot be recovered — not by us, not by anyone.
        </p>
        {confirming ? (
          <div className="btn-pair">
            <button type="button" className="btn btn--danger" onClick={wipe}>
              Erase it. I have the paper.
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="btn-pair">
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => setConfirming(true)}
            >
              Erase this vault
            </button>
          </div>
        )}
      </div>

      <div className="btn-pair">
        <button type="button" className="btn" onClick={onDone}>
          Back
        </button>
      </div>
    </section>
  );
}

function Chevron() {
  return (
    <svg
      className="chev"
      width="7"
      height="12"
      viewBox="0 0 7 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 1l5 5-5 5" />
    </svg>
  );
}

/** The date a person would write, not the one a database would. */
function created(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
