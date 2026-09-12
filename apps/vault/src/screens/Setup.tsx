import { useState } from "react";
import {
  MIN_PASSWORD_LENGTH,
  encodePaperVault,
  generateVault,
  lock,
  wipe,
} from "@pixstock/vault-crypto";
import { saveBlob } from "../vault/storage";
import { QrCode } from "../components/QrCode";

const base58ish = (bytes: Uint8Array) =>
  Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("") + "…";

export function Setup({ onReady }: { onReady: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState<{ code: string; publicKey: Uint8Array } | null>(null);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= MIN_PASSWORD_LENGTH && confirm === password;

  async function create() {
    setBusy(true);
    setError(null);
    const { seed, publicKey } = generateVault();
    try {
      const blob = await lock(seed, password);
      saveBlob(blob);
      setPaper({ code: encodePaperVault(blob), publicKey });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      // The seed is locked, or it failed. Either way it stops existing here.
      wipe(seed);
      setBusy(false);
    }
  }

  if (paper) {
    return (
      <section className="stack">
        <header className="stack stack--tight">
          <p className="eyebrow">Paper-Vault</p>
          <h2>Print this, now</h2>
          <p className="lede">
            This code is the only copy of your key that survives losing the
            phone. It is encrypted with your master password — paper alone is
            not enough to spend.
          </p>
        </header>

        <QrCode text={paper.code} px={280} />

        <p className="muted">
          Vault <span className="num">{base58ish(paper.publicKey)}</span>
        </p>

        <div className="row">
          <button type="button" className="btn" onClick={() => print()}>
            Print
          </button>
          <button type="button" className="btn btn--solid" onClick={onReady}>
            I have printed it
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="stack">
      <header className="stack stack--tight">
        <p className="eyebrow">First run</p>
        <h2>Create your vault</h2>
        <p className="lede">
          The master password encrypts your key on this device. Nobody can
          reset it — not us, not anyone. Write it down before you continue.
        </p>
      </header>

      <label className="field">
        <span>Master password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder={`at least ${MIN_PASSWORD_LENGTH} characters`}
        />
        {tooShort && (
          <small className="muted">
            {MIN_PASSWORD_LENGTH - password.length} more character
            {MIN_PASSWORD_LENGTH - password.length === 1 ? "" : "s"}.
          </small>
        )}
      </label>

      <label className="field">
        <span>Confirm</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {mismatch && <small className="muted">These do not match.</small>}
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
          disabled={!ready || busy}
          onClick={() => void create()}
        >
          {busy ? "Encrypting…" : "Create vault"}
        </button>
      </div>
    </section>
  );
}
