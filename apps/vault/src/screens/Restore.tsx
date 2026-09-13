import { useState } from "react";
import {
  PAPER_VAULT_MAGIC,
  decodePaperVault,
  unlock,
  wipe,
  type VaultBlob,
} from "@pixstock/vault-crypto";
import { saveBlob } from "../vault/storage";
import { useCodeScanner } from "../vault/useCodeScanner";

const looksLikePaperVault = (text: string) => text.trim().startsWith(PAPER_VAULT_MAGIC);

const shortKey = (publicKey: Uint8Array) =>
  Array.from(publicKey.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("") + "…";

/**
 * Bringing a vault back from paper.
 *
 * The export half has existed since the first day and the import half has
 * not, which made the Paper-Vault a promise rather than a backup. This is the
 * other half: the same phone after a reset, or a different phone entirely.
 *
 * The password is not optional here. Decryption is what proves the sheet is
 * yours — the code alone is ciphertext, which is precisely why it is safe to
 * print — and `unlock` refuses a blob whose public key does not match the
 * seed inside it, so a doctored sheet cannot install a key you did not choose.
 */
export function Restore({ onRestored, onCancel }: { onRestored: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<VaultBlob | null>(null);

  const scanner = useCodeScanner(looksLikePaperVault);
  const scanned = scanner.state.status === "done" ? scanner.state.text : "";
  const text = scanned || code;

  async function restore() {
    setBusy(true);
    setError(null);

    let blob: VaultBlob;
    try {
      blob = decodePaperVault(text.trim());
    } catch (err) {
      setError(`That is not a Paper-Vault code: ${(err as Error).message}`);
      setBusy(false);
      return;
    }

    let seed: Uint8Array | null = null;
    try {
      // Opening it here is the check. Storing a blob nobody has opened would
      // hand someone a vault that fails at the moment they need it.
      seed = await unlock(blob, password);
      saveBlob(blob);
      setRestored(blob);
    } catch (err) {
      const message = (err as Error).message;
      setError(
        message.includes("wrong password")
          ? "That password does not open this code. Nobody can reset it, not even us."
          : message,
      );
    } finally {
      if (seed) wipe(seed);
      setBusy(false);
    }
  }

  if (restored) {
    return (
      <section className="stack">
        <header className="stack stack--tight">
          <p className="eyebrow">Restored</p>
          <h2>Your vault is back</h2>
          <p className="lede">
            The same key, on this device. Nothing was sent anywhere to do it — the sheet held
            everything, and your password opened it.
          </p>
        </header>

        <p className="muted">
          Vault <span className="num">{shortKey(restored.publicKey)}</span> · created{" "}
          <span className="num">
            {new Date(restored.createdAt * 1000).toISOString().slice(0, 10)}
          </span>
        </p>

        <div className="row">
          <button type="button" className="btn btn--solid" onClick={onRestored}>
            Continue
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="stack">
      <header className="stack stack--tight">
        <p className="eyebrow">Restore</p>
        <h2>Read your Paper-Vault</h2>
        <p className="lede">
          Point the camera at the printed code, or type it in. It is encrypted: without the
          master password it is 127 bytes of nothing.
        </p>
      </header>

      <div className="viewport">
        <video ref={scanner.videoRef} playsInline muted className="viewport-video" />
        {scanner.state.status === "idle" && (
          <div className="viewport-idle">
            <button type="button" className="btn btn--solid" onClick={() => void scanner.start()}>
              Start the camera
            </button>
          </div>
        )}
      </div>

      {scanner.state.status === "scanning" && <p className="muted">Looking for the code…</p>}
      {scanner.state.status === "done" && <p className="muted">Code read. Now the password.</p>}
      {scanner.state.status === "error" && (
        <p className="alert" role="alert">
          {scanner.state.message}
        </p>
      )}

      <label className="field">
        <span>Paper-Vault code</span>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => {
            setCode(e.target.value);
            if (scanner.state.status === "done") scanner.reset();
          }}
          placeholder={`${PAPER_VAULT_MAGIC}…`}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>

      <label className="field">
        <span>Master password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="row">
        <button
          type="button"
          className="btn btn--solid"
          disabled={busy || text.trim().length === 0 || password.length === 0}
          onClick={() => void restore()}
        >
          {busy ? "Opening…" : "Restore"}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Back
        </button>
      </div>
    </section>
  );
}
